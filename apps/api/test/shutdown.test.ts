import { describe, it, expect, vi } from "vitest";
import type { Server } from "node:http";
import { createShutdownHandler } from "../src/lib/shutdown.js";

describe("createShutdownHandler", () => {
  it("drains server, calls pool.end() and redis.quit(), then exits 0", async () => {
    const mockServer = {
      close: vi.fn((cb: (err?: Error) => void) => cb()),
    } as unknown as Server;

    const mockPool = {
      end: vi.fn().mockResolvedValue(undefined),
    };

    const mockRedis = {
      quit: vi.fn().mockResolvedValue("OK"),
    };

    const mockExit = vi.fn();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    const shutdown = createShutdownHandler(
      mockServer,
      { pool: mockPool, redis: mockRedis },
      { forceExitMs: 1000, exit: mockExit, logger: mockLogger },
    );

    await shutdown("SIGTERM");

    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(mockPool.end).toHaveBeenCalledTimes(1);
    expect(mockRedis.quit).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("exits with code 1 if server close throws error", async () => {
    const closeError = new Error("server close error");
    const mockServer = {
      close: vi.fn((cb: (err?: Error) => void) => cb(closeError)),
    } as unknown as Server;

    const mockPool = {
      end: vi.fn().mockResolvedValue(undefined),
    };

    const mockRedis = {
      quit: vi.fn().mockResolvedValue("OK"),
    };

    const mockExit = vi.fn();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    const shutdown = createShutdownHandler(
      mockServer,
      { pool: mockPool, redis: mockRedis },
      { forceExitMs: 1000, exit: mockExit, logger: mockLogger },
    );

    await shutdown("SIGINT");

    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("is idempotent when invoked multiple times", async () => {
    const mockServer = {
      close: vi.fn((cb: (err?: Error) => void) => cb()),
    } as unknown as Server;

    const mockPool = { end: vi.fn().mockResolvedValue(undefined) };
    const mockRedis = { quit: vi.fn().mockResolvedValue("OK") };
    const mockExit = vi.fn();
    const mockLogger = { info: vi.fn(), error: vi.fn() } as any;

    const shutdown = createShutdownHandler(
      mockServer,
      { pool: mockPool, redis: mockRedis },
      { forceExitMs: 1000, exit: mockExit, logger: mockLogger },
    );

    await Promise.all([shutdown("SIGTERM"), shutdown("SIGTERM")]);

    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledTimes(1);
  });
});
