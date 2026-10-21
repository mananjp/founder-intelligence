import type { Server } from "node:http";
import { logger } from "./logger.js";

export interface ShutdownResources {
  pool: { end: () => Promise<void> };
  redis: { quit: () => Promise<string | unknown> };
}

export interface ShutdownOptions {
  forceExitMs?: number;
  exit?: (code: number) => void;
  logger?: typeof logger;
}

export function createShutdownHandler(
  server: Server,
  resources: ShutdownResources,
  options: ShutdownOptions = {},
) {
  const log = options.logger ?? logger;
  const forceExitMs = options.forceExitMs ?? 5000;
  const exit = options.exit ?? process.exit;
  let isShuttingDown = false;

  return async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    log.info({ signal }, "Received shutdown signal, stopping new connections");

    const forceTimer = setTimeout(() => {
      log.error("Graceful shutdown timeout exceeded, forcing exit");
      exit(1);
    }, forceExitMs);
    if (typeof forceTimer.unref === "function") {
      forceTimer.unref();
    }

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      log.info("HTTP server closed, draining database pool and redis connection");

      await Promise.allSettled([
        resources.pool.end(),
        resources.redis.quit(),
      ]);

      clearTimeout(forceTimer);
      log.info("Graceful shutdown completed successfully");
      exit(0);
    } catch (err) {
      log.error({ err }, "Error during graceful shutdown");
      clearTimeout(forceTimer);
      exit(1);
    }
  };
}
