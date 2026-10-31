import type { Response } from "express";
import IORedis from "ioredis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";
import { redis } from "./queue.js";
import type { RunEvent } from "@fi/contracts";

export interface StreamEventItem {
  id: string;
  event: RunEvent;
}

/** Returns the stream key for research run events */
export function getRunStreamKey(runId: string): string {
  return `run:${runId}:events`;
}

/** Returns the pub/sub channel for research run events */
export function getRunChannelKey(runId: string): string {
  return `run:${runId}`;
}

/** Parses raw fields array from an XRANGE/XREAD entry into a typed RunEvent object */
export function parseStreamFields(fields: string[]): RunEvent {
  const dict: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    const k = fields[i];
    const v = fields[i + 1];
    if (k && v !== undefined) {
      dict[k] = v;
    }
  }
  if (dict.data) {
    try {
      return JSON.parse(dict.data);
    } catch {
      // ignore
    }
  }
  if (dict.payload) {
    try {
      return JSON.parse(dict.payload);
    } catch {
      // ignore
    }
  }
  return dict as unknown as RunEvent;
}

/**
 * Publishes a research run progress event:
 * 1. Appends to Redis stream `run:{runId}:events` for durable replay via Last-Event-ID.
 * 2. Publishes to Redis pub/sub channel `run:{runId}` for active SSE subscribers.
 */
export async function publishRunEvent(
  runId: string,
  event: RunEvent,
): Promise<string> {
  const streamKey = getRunStreamKey(runId);
  const channel = getRunChannelKey(runId);
  const enrichedEvent: RunEvent = {
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
  };
  const jsonPayload = JSON.stringify(enrichedEvent);

  let streamId = `${Date.now()}-0`;
  try {
    const addedId = await redis.xadd(
      streamKey,
      "MAXLEN",
      "~",
      "1000",
      "*",
      "type",
      event.type,
      "data",
      jsonPayload,
    );
    if (addedId) {
      streamId = addedId;
    }
  } catch (err) {
    logger.warn({ err, runId }, "Failed to append event to Redis stream");
  }

  try {
    const pubPayload = JSON.stringify({
      id: streamId,
      event: enrichedEvent,
    });
    await redis.publish(channel, pubPayload);
  } catch (err) {
    logger.warn({ err, runId }, "Failed to publish event to Redis pub/sub");
  }

  return streamId;
}

/**
 * Reads historical events from the Redis stream, optionally starting after `fromId`.
 */
export async function getStreamHistory(
  runId: string,
  fromId?: string,
): Promise<StreamEventItem[]> {
  const streamKey = getRunStreamKey(runId);
  try {
    const rawEntries = (await redis.xrange(streamKey, "-", "+")) as Array<
      [string, string[]]
    >;
    if (!Array.isArray(rawEntries)) return [];

    const items: StreamEventItem[] = [];
    let skip = Boolean(fromId);

    for (const [id, fields] of rawEntries) {
      if (skip) {
        if (id === fromId) {
          skip = false;
        }
        continue;
      }
      items.push({
        id,
        event: parseStreamFields(fields),
      });
    }

    return items;
  } catch (err) {
    logger.warn({ err, runId }, "Failed to read history from Redis stream");
    return [];
  }
}

/**
 * Streams research run events to an Express Response via Server-Sent Events (SSE).
 * Honours `Last-Event-ID` header (or query param) to replay missed events from Redis Stream.
 */
export async function streamRunEvents(
  runId: string,
  res: Response,
  options?: { lastEventId?: string },
): Promise<void> {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  if (typeof (res as any).flushHeaders === "function") {
    (res as any).flushHeaders();
  }

  let lastSentId = options?.lastEventId;

  // 1. Replay missed historical events from Redis stream
  if (lastSentId !== undefined && lastSentId !== "") {
    const history = await getStreamHistory(runId, lastSentId);
    for (const item of history) {
      sendSSE(res, item.id, item.event);
      lastSentId = item.id;
    }
  } else {
    const history = await getStreamHistory(runId);
    for (const item of history) {
      sendSSE(res, item.id, item.event);
      lastSentId = item.id;
    }
  }

  // 2. Subscribe to live events via Redis pub/sub
  const sub = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  sub.on("error", (err) => {
    logger.warn({ err, runId }, "SSE Redis subscriber error");
  });

  const channel = getRunChannelKey(runId);
  try {
    await sub.subscribe(channel);
  } catch (err) {
    logger.warn({ err, runId }, "Failed to subscribe to run channel");
  }

  sub.on("message", (_ch, message) => {
    try {
      const parsed = JSON.parse(message);
      if (parsed && typeof parsed === "object") {
        const id = parsed.id ?? `${Date.now()}-0`;
        const eventData = parsed.event ?? parsed;
        if (!lastSentId || id !== lastSentId) {
          sendSSE(res, id, eventData);
          lastSentId = id;
        }
      }
    } catch {
      res.write(`data: ${message}\n\n`);
    }
  });

  // 3. Heartbeat keep-alive ping every 15 seconds
  const pingInterval = setInterval(() => {
    if (!res.writableEnded) {
      res.write(": ping\n\n");
    }
  }, 15000);

  // 4. Cleanup on connection close
  res.on("close", () => {
    clearInterval(pingInterval);
    void sub.unsubscribe(channel).catch(() => {});
    void sub.quit().catch(() => {});
  });
}

function sendSSE(res: Response, id: string, event: RunEvent): void {
  if (res.writableEnded) return;
  res.write(`id: ${id}\n`);
  if (event.type) {
    res.write(`event: ${event.type}\n`);
  }
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}
