import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

import {
  createRedisRateLimiter,
  isHealthEndpoint,
  isInternalEndpoint,
  type RedisClientLike,
} from "../src/middleware/rateLimit.js";
import { logger } from "../src/lib/logger.js";
import { buildApp } from "../src/app.js";

/**
 * Realistic Mock Redis client implementing the exact commands
 * used by rate-limit-redis: SCRIPT LOAD, EVALSHA, and DEL.
 */
class MockRedisClient implements RedisClientLike {
  public store = new Map<string, { count: number; expireAt: number }>();
  public calls: { command: string; args: any[] }[] = [];
  public shouldFail = false;
  public failError = new Error("Redis connection refused (ECONNREFUSED)");

  async call(command: string, ...args: any[]): Promise<any> {
    this.calls.push({ command, args });

    if (this.shouldFail) {
      throw this.failError;
    }

    if (command === "SCRIPT" && args[0] === "LOAD") {
      return "mock-sha-test-hash";
    }

    if (command === "EVALSHA") {
      // args: [sha, "1", key, windowMs]
      const key = args[2] as string;
      const windowMs = Number(args[3]);
      const now = Date.now();

      const existing = this.store.get(key);
      if (!existing || existing.expireAt <= now) {
        this.store.set(key, { count: 1, expireAt: now + windowMs });
        return [1, windowMs];
      }

      existing.count += 1;
      const ttl = Math.max(0, existing.expireAt - now);
      return [existing.count, ttl];
    }

    if (command === "DEL") {
      const key = args[0] as string;
      this.store.delete(key);
      return 1;
    }

    return null;
  }

  clear() {
    this.store.clear();
    this.calls = [];
    this.shouldFail = false;
  }
}

describe("Rate Limiting Unit & Integration Tests", () => {
  let mockRedis: MockRedisClient;

  beforeEach(() => {
    mockRedis = new MockRedisClient();
    vi.restoreAllMocks();
  });

  describe("Helper Functions", () => {
    it("identifies health endpoints correctly", () => {
      expect(isHealthEndpoint("/health")).toBe(true);
      expect(isHealthEndpoint("/health/")).toBe(true);
      expect(isHealthEndpoint("/health/ready")).toBe(true);
      expect(isHealthEndpoint("/health/live")).toBe(true);
      expect(isHealthEndpoint("/health/deep/check?foo=bar")).toBe(true);
      expect(isHealthEndpoint("/healthy")).toBe(false);
      expect(isHealthEndpoint("/v1/health")).toBe(false);
      expect(isHealthEndpoint("/api/workspaces")).toBe(false);
    });

    it("identifies internal endpoints correctly", () => {
      expect(isInternalEndpoint("/internal")).toBe(true);
      expect(isInternalEndpoint("/internal/")).toBe(true);
      expect(isInternalEndpoint("/internal/ping")).toBe(true);
      expect(isInternalEndpoint("/internal/research/runs/123/start")).toBe(true);
      expect(isInternalEndpoint("/internal-service")).toBe(false);
      expect(isInternalEndpoint("/v1/internal")).toBe(false);
    });
  });

  describe("Standard API Rate Limiter (Redis-backed)", () => {
    it("allows requests under the limit and tracks hits in Redis", async () => {
      const app = express();
      const limiter = createRedisRateLimiter({
        windowMs: 60_000,
        limit: 3,
        prefix: "rl:api:",
        redisClient: mockRedis,
      });

      app.use(limiter);
      app.get("/api/test", (_req, res) => res.json({ ok: true }));

      // Request 1
      const res1 = await request(app).get("/api/test");
      expect(res1.status).toBe(200);
      expect(res1.headers["ratelimit-remaining"]).toBe("2");

      // Request 2
      const res2 = await request(app).get("/api/test");
      expect(res2.status).toBe(200);
      expect(res2.headers["ratelimit-remaining"]).toBe("1");

      // Verify that Redis was called with the rl:api: prefix
      const evalCalls = mockRedis.calls.filter((c) => c.command === "EVALSHA");
      expect(evalCalls.length).toBe(2);
      expect(evalCalls[0]?.args[2]).toMatch(/^rl:api:/);
    });

    it("returns 429 with uniform error envelope when limit is exceeded", async () => {
      const app = express();
      const limiter = createRedisRateLimiter({
        windowMs: 60_000,
        limit: 2,
        prefix: "rl:api:",
        redisClient: mockRedis,
      });

      app.use(limiter);
      app.get("/api/test", (_req, res) => res.json({ ok: true }));

      await request(app).get("/api/test");
      await request(app).get("/api/test");

      // 3rd request should exceed limit
      const res3 = await request(app).get("/api/test");
      expect(res3.status).toBe(429);
      expect(res3.body).toEqual({
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests, please try again later.",
        },
      });
      expect(res3.headers["ratelimit-remaining"]).toBe("0");
    });
  });

  describe("Health Endpoint Exemption", () => {
    it("bypasses rate limiting for /health and /health/ready", async () => {
      const app = express();
      const limiter = createRedisRateLimiter({
        windowMs: 60_000,
        limit: 2,
        prefix: "rl:api:",
        redisClient: mockRedis,
        skip: (req) => isHealthEndpoint(req.originalUrl || req.url),
      });

      app.use(limiter);
      app.get("/health", (_req, res) => res.json({ status: "ok" }));
      app.get("/health/ready", (_req, res) => res.json({ status: "ready" }));

      // Send 5 requests to /health (more than limit of 2)
      for (let i = 0; i < 5; i++) {
        const res = await request(app).get("/health");
        expect(res.status).toBe(200);
      }

      // Send 5 requests to /health/ready
      for (let i = 0; i < 5; i++) {
        const res = await request(app).get("/health/ready");
        expect(res.status).toBe(200);
      }

      // Verify that Redis EVALSHA was NEVER called for health routes
      const evalCalls = mockRedis.calls.filter((c) => c.command === "EVALSHA");
      expect(evalCalls.length).toBe(0);
    });
  });

  describe("Internal Tier vs Standard Tier Independence", () => {
    it("enforces higher limit for internal and isolates counters", async () => {
      const app = express();

      const internalLimiter = createRedisRateLimiter({
        windowMs: 60_000,
        limit: 5, // higher tier
        prefix: "rl:internal:",
        redisClient: mockRedis,
        skip: (req) => isHealthEndpoint(req.originalUrl || req.url),
      });

      const apiLimiter = createRedisRateLimiter({
        windowMs: 60_000,
        limit: 2, // standard tier
        prefix: "rl:api:",
        redisClient: mockRedis,
        skip: (req) =>
          isHealthEndpoint(req.originalUrl || req.url) ||
          isInternalEndpoint(req.originalUrl || req.url),
      });

      app.use("/internal", internalLimiter);
      app.use(apiLimiter);

      app.get("/internal/ping", (_req, res) =>
        res.json({ tier: "internal" }),
      );
      app.get("/api/data", (_req, res) => res.json({ tier: "api" }));

      // 1. Consume API limit (2 requests)
      await request(app).get("/api/data");
      await request(app).get("/api/data");
      const apiBlocked = await request(app).get("/api/data");
      expect(apiBlocked.status).toBe(429);

      // 2. Internal route must NOT be blocked by API rate limit!
      const intRes1 = await request(app).get("/internal/ping");
      expect(intRes1.status).toBe(200);
      expect(intRes1.body.tier).toBe("internal");

      const intRes2 = await request(app).get("/internal/ping");
      expect(intRes2.status).toBe(200);

      const intRes3 = await request(app).get("/internal/ping");
      expect(intRes3.status).toBe(200);

      // Verify separate keys in mockRedis
      const keys = Array.from(mockRedis.store.keys());
      expect(keys.some((k) => k.startsWith("rl:api:"))).toBe(true);
      expect(keys.some((k) => k.startsWith("rl:internal:"))).toBe(true);
    });
  });

  describe("Fail-Open Behavior on Redis Failure", () => {
    it("allows requests through when Redis is down and logs the error", async () => {
      const errorSpy = vi.spyOn(logger, "error");
      mockRedis.shouldFail = true;

      const app = express();
      const limiter = createRedisRateLimiter({
        windowMs: 60_000,
        limit: 2,
        prefix: "rl:api:",
        redisClient: mockRedis,
      });

      app.use(limiter);
      app.get("/api/critical", (_req, res) =>
        res.json({ message: "service available" }),
      );

      // Even though Redis is completely down, request MUST succeed (fail-open)
      const res = await request(app).get("/api/critical");
      expect(res.status).toBe(200);
      expect(res.body.message).toBe("service available");

      // Verify that the failure was logged through logger.error
      expect(errorSpy).toHaveBeenCalled();
      const logArgs = errorSpy.mock.calls[0];
      expect(logArgs?.[0]).toMatchObject({ prefix: "rl:api:" });
    });

    it("resumes normal rate limiting when Redis recovers", async () => {
      mockRedis.shouldFail = true;

      const app = express();
      const limiter = createRedisRateLimiter({
        windowMs: 60_000,
        limit: 2,
        prefix: "rl:api:",
        redisClient: mockRedis,
      });

      app.use(limiter);
      app.get("/api/recovering", (_req, res) => res.json({ ok: true }));

      // While failing: request succeeds
      const failRes = await request(app).get("/api/recovering");
      expect(failRes.status).toBe(200);

      // Redis recovers!
      mockRedis.shouldFail = false;

      // 1st good request
      const ok1 = await request(app).get("/api/recovering");
      expect(ok1.status).toBe(200);

      // 2nd good request
      const ok2 = await request(app).get("/api/recovering");
      expect(ok2.status).toBe(200);

      // 3rd request -> 429
      const blocked = await request(app).get("/api/recovering");
      expect(blocked.status).toBe(429);
    });
  });

  describe("Application Integration (buildApp) & Internal Security", () => {
    it("routes /health, guards /internal with token, and authenticates /v1", async () => {
      const app = buildApp();

      // 1. Health endpoint works without auth and is not rate-limited
      const healthRes = await request(app).get("/health");
      expect(healthRes.status).toBe(200);
      expect(healthRes.body).toEqual({ status: "ok" });

      // 2. Inbound /internal endpoint without token is rejected (Security concern #1)
      const unauthInternal = await request(app).get("/internal/ping");
      expect(unauthInternal.status).toBe(401);
      expect(unauthInternal.body.error.code).toBe("unauthorized_internal");

      // 3. Inbound /internal endpoint with invalid token is rejected
      const badTokenInternal = await request(app)
        .get("/internal/ping")
        .set("x-internal-token", "wrong-token-abc");
      expect(badTokenInternal.status).toBe(401);
      expect(badTokenInternal.body.error.code).toBe("unauthorized_internal");

      // 4. Inbound /internal endpoint with valid internal token succeeds
      const internalRes = await request(app)
        .get("/internal/ping")
        .set("x-internal-token", process.env.INTERNAL_SERVICE_TOKEN!);
      expect(internalRes.status).toBe(200);
      expect(internalRes.body).toEqual({ status: "ok", tier: "internal" });

      // 5. /v1 routes still enforce bearer authentication
      const v1Res = await request(app).get("/v1/workspaces");
      expect(v1Res.status).toBe(401);
      expect(v1Res.body.error.code).toBe("unauthenticated");
    });
  });
});
