import type { Request, Response } from "express";
import rateLimit, {
  type Options as RateLimitOptions,
  type RateLimitRequestHandler,
} from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import { redis as defaultRedis } from "../lib/queue.js";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";

/** Checks if a request URL targets the /health endpoint tree */
export function isHealthEndpoint(url: string): boolean {
  const path = url.split("?")[0] ?? "";
  return path === "/health" || path.startsWith("/health/");
}

/** Checks if a request URL targets the /internal endpoint tree */
export function isInternalEndpoint(url: string): boolean {
  const path = url.split("?")[0] ?? "";
  return path === "/internal" || path.startsWith("/internal/");
}

export interface RedisClientLike {
  call(command: string, ...args: (string | number)[]): Promise<any>;
  status?: string;
}

export function createSendCommand(
  client: RedisClientLike,
  prefix: string,
  timeoutMs = 1000,
): (...args: string[]) => Promise<RedisReply> {
  return async (...args: string[]): Promise<RedisReply> => {
    const command = args[0] as string;
    const cmdArgs = args.slice(1);

    // If IORedis client is not in ready state, fail fast so requests fail-open immediately
    if (client.status && client.status !== "ready") {
      const err = new Error(`Redis client not ready (status: ${client.status})`);
      logger.error(
        { err, prefix, command },
        "Redis rate-limit command failed (client not ready)",
      );
      throw err;
    }

    try {
      let timer: NodeJS.Timeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Redis command '${command}' timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        if (typeof timer.unref === "function") {
          timer.unref();
        }
      });

      const result = await Promise.race([
        client.call(command, ...cmdArgs),
        timeoutPromise,
      ]);
      clearTimeout(timer!);
      return result as RedisReply;
    } catch (err) {
      logger.error(
        { err, prefix, command },
        "Redis rate-limit command failed",
      );
      throw err;
    }
  };
}

export class SafeRedisStore extends RedisStore {
  override async init(options: any): Promise<void> {
    try {
      await super.init(options);
    } catch (err) {
      logger.error(
        { err, prefix: this.prefix },
        "Redis rate-limit store init failed; requests will fail-open until Redis is available",
      );
    }
  }

  override async increment(key: string) {
    if (this.incrementScriptSha) {
      await this.incrementScriptSha.catch(() => {
        this.incrementScriptSha = this.loadIncrementScript();
      });
    }
    try {
      return await super.increment(key);
    } catch (err) {
      logger.error(
        { err, prefix: this.prefix, key },
        "Redis rate-limit store increment failed; failing open",
      );
      throw err;
    }
  }
}

export interface CreateRateLimiterOptions {
  windowMs?: number;
  limit?: number;
  prefix: string;
  redisClient?: RedisClientLike;
  skip?: (req: Request, res: Response) => boolean | Promise<boolean>;
  message?: string;
  timeoutMs?: number;
}

export function createRedisRateLimiter(
  options: CreateRateLimiterOptions,
): RateLimitRequestHandler {
  const {
    windowMs = env.RATE_LIMIT_WINDOW_MS ?? 60_000,
    limit = 300,
    prefix,
    redisClient = defaultRedis,
    skip,
    message = "Too many requests, please try again later.",
    timeoutMs = 1000,
  } = options;

  const store = new SafeRedisStore({
    sendCommand: createSendCommand(redisClient, prefix, timeoutMs),
    prefix,
  });

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    store,
    skip,
    message,
    validate: { ip: false, xForwardedForHeader: false },
    handler: (req, res, _next, opts) => {
      const requestId = (req as any).id;
      res.status(opts.statusCode).json({
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: opts.message,
          requestId,
        },
      });
    },
  });
}

/**
 * Standard API rate limiter:
 * - Redis-backed via rate-limit-redis
 * - Prefix: rl:api:
 * - Window: 60,000ms (1 min)
 * - Default limit: 300 req/min
 * - Excludes /health* and /internal* endpoints
 * - Fail-open with error logging
 */
export const apiRateLimiter: RateLimitRequestHandler = createRedisRateLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_API_LIMIT,
  prefix: "rl:api:",
  skip: (req) =>
    isHealthEndpoint(req.originalUrl || req.url) ||
    isInternalEndpoint(req.originalUrl || req.url),
});

/**
 * Internal API rate limiter:
 * - Redis-backed via rate-limit-redis
 * - Prefix: rl:internal:
 * - Window: 60,000ms (1 min)
 * - Default limit: 1200 req/min (higher tier)
 * - Excludes /health* endpoints
 * - Fail-open with error logging
 */
export const internalRateLimiter: RateLimitRequestHandler =
  createRedisRateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_INTERNAL_LIMIT,
    prefix: "rl:internal:",
    skip: (req) => isHealthEndpoint(req.originalUrl || req.url),
  });