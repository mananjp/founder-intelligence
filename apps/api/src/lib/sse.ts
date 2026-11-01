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

const STREAM_ID_PATTERN = /^\d+-\d+$/;

/** Returns true for a well-formed Redis stream id (`ms-seq`). */
export function isStreamId(value: string | undefined): value is string {
  return typeof value === "string" && STREAM_ID_PATTERN.test(value);
}

/**
 * Compares two Redis stream ids. Returns a negative number when `a < b`, zero
 * when equal, and a positive number when `a > b`. Non-numeric ids fall back to
 * lexicographic order so callers never throw on unexpected input.
 */
export function compareStreamIds(a: string, b: string): number {
  if (!isStreamId(a) || !isStreamId(b)) {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  const aDash = a.indexOf("-");
  const bDash = b.indexOf("-");
  const aMs = Number(a.slice(0, aDash));
  const aSeq = Number(a.slice(aDash + 1));
  const bMs = Number(b.slice(0, bDash));
  const bSeq = Number(b.slice(bDash + 1));
  if (aMs !== bMs) return aMs - bMs;
  return aSeq - bSeq;
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
 * Reads historical events from the Redis stream, optionally starting strictly
 * after `fromId`. Uses an exclusive XRANGE bound so a client that falls off the
 * trimmed stream (MAXLEN) still resumes from the oldest retained event instead
 * of silently replaying nothing. Non-numeric ids replay the full history.
 */
export async function getStreamHistory(
  runId: string,
  fromId?: string,
): Promise<StreamEventItem[]> {
  const streamKey = getRunStreamKey(runId);
  const start = isStreamId(fromId) ? `(${fromId}` : "-";
  try {
    const rawEntries = (await redis.xrange(streamKey, start, "+")) as Array<
      [string, string[]]
    >;
    if (!Array.isArray(rawEntries)) return [];

    const items: StreamEventItem[] = [];

    for (const [id, fields] of rawEntries) {
      // Defensive filter for clients/fakes that ignore the exclusive bound.
      if (isStreamId(fromId) && compareStreamIds(id, fromId) <= 0) {
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
  if (lastSentId === "") lastSentId = undefined;

  const channel = getRunChannelKey(runId);

  // Subscribe BEFORE reading history so events published during the replay
  // window are buffered instead of lost between the XRANGE and SUBSCRIBE.
  const sub = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  sub.on("error", (err) => {
    logger.warn({ err, runId }, "SSE Redis subscriber error");
  });

  const sentIds = new Set<string>();
  let closed = false;
  let replayComplete = false;
  const buffered: StreamEventItem[] = [];
  let pingInterval: ReturnType<typeof setInterval> | undefined;

  const teardown = () => {
    if (closed) return;
    closed = true;
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = undefined;
    }
    void sub.unsubscribe(channel).catch(() => {});
    void sub.quit().catch(() => {});
  };

  const flush = (item: StreamEventItem) => {
    if (closed || sentIds.has(item.id)) return;
    if (
      isStreamId(lastSentId) &&
      isStreamId(item.id) &&
      compareStreamIds(item.id, lastSentId) <= 0
    ) {
      return;
    }
    sentIds.add(item.id);
    lastSentId = item.id;
    sendSSE(res, item.id, item.event);

    // A finished run is terminal: release the subscriber and close the stream
    // so clients do not keep a dangling connection (and Redis client) forever.
    if (item.event?.type === "run.finished") {
      teardown();
      if (!res.writableEnded) {
        res.end();
      }
    }
  };

  sub.on("message", (_ch, message) => {
    const item = parsePubSubMessage(message);
    if (!item) {
      logger.warn({ runId }, "Ignoring malformed SSE pub/sub message");
      return;
    }
    if (!replayComplete) {
      buffered.push(item);
      return;
    }
    flush(item);
  });

  res.on("close", teardown);

  let subscribeFailed = false;
  try {
    await sub.subscribe(channel);
  } catch (err) {
    subscribeFailed = true;
    logger.error({ err, runId }, "Failed to subscribe to run channel");
  }

  // 1. Replay missed historical events from Redis stream
  const history = await getStreamHistory(runId, lastSentId);
  for (const item of history) {
    flush(item);
  }

  if (!closed) {
    replayComplete = true;
    buffered.sort((a, b) => compareStreamIds(a.id, b.id));
    for (const item of buffered.splice(0)) {
      flush(item);
    }
  }

  if (closed) return;

  if (subscribeFailed) {
    teardown();
    if (!res.writableEnded) {
      res.end();
    }
    return;
  }

  // 2. Heartbeat keep-alive ping every 15 seconds
  pingInterval = setInterval(() => {
    if (!res.writableEnded) {
      res.write(": ping\n\n");
    }
  }, 15000);
}

/** Parses a pub/sub payload published by `publishRunEvent`. */
function parsePubSubMessage(message: string): StreamEventItem | null {
  try {
    const parsed = JSON.parse(message);
    if (!parsed || typeof parsed !== "object") return null;
    const id =
      typeof parsed.id === "string" ? parsed.id : `${Date.now()}-0`;
    const event = (parsed.event ?? parsed) as RunEvent;
    if (!event || typeof event !== "object") return null;
    return { id, event };
  } catch {
    return null;
  }
}

function sendSSE(res: Response, id: string, event: RunEvent): void {
  if (res.writableEnded) return;
  res.write(`id: ${id}\n`);
  if (event.type) {
    res.write(`event: ${event.type}\n`);
  }
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}
