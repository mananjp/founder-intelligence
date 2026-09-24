import IORedis from "ioredis";
import { env } from "../config/env.js";

export const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

/**
 * Research jobs are consumed by the Python worker (Celery). We use the AI service's
 * HTTP enqueue endpoint to avoid coupling to Celery's wire format.
 */
export async function enqueueResearchRun(runId: string): Promise<void> {
  const res = await fetch(`${env.AI_SERVICE_URL}/internal/research/runs/${runId}/start`, {
    method: "POST",
    headers: { "x-internal-token": env.INTERNAL_SERVICE_TOKEN },
  });
  if (!res.ok) throw new Error(`AI service refused run ${runId}: ${res.status}`);
}
