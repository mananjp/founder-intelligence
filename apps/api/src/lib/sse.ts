import type { Response } from "express";
import { redis } from "./queue.js";
import IORedis from "ioredis";
import { env } from "../config/env.js";

/** Stream research-run progress events (published by the AI worker on Redis channel run:{id}) to the browser. */
export async function streamRunEvents(runId: string, res: Response): Promise<void> {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const sub = new IORedis(env.REDIS_URL);
  await sub.subscribe(`run:${runId}`);
  sub.on("message", (_ch, msg) => res.write(`data: ${msg}\n\n`));
  const ping = setInterval(() => res.write(": ping\n\n"), 15000);
  res.on("close", () => { clearInterval(ping); void sub.quit(); });
  void redis; // shared client kept for other modules
}
