import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import {
  AiInterviewTurnPayload,
  AiInterviewTurnResult,
  type AiInterviewTurnPayloadType,
  type AiInterviewTurnResultType,
} from "./interview.schema.js";
import { runFakeAiInterviewTurn } from "./interview.fakeAi.js";

/**
 * Proxies the interview turn request to the AI service (/internal/interview/turn).
 * If the AI service is unreachable, returns 404/501 (e.g. before Task 12 lands),
 * or in offline/test environments, gracefully falls back to fake AI for week 1.
 */
export async function queryAiInterviewTurn(
  payload: AiInterviewTurnPayloadType,
): Promise<AiInterviewTurnResultType> {
  const validatedPayload = AiInterviewTurnPayload.parse(payload);

  if (env.AI_SERVICE_URL && process.env.FORCE_FAKE_AI !== "true") {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`${env.AI_SERVICE_URL}/internal/interview/turn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-token": env.INTERNAL_SERVICE_TOKEN,
        },
        body: JSON.stringify(validatedPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const body = await res.json();
        const parsed = AiInterviewTurnResult.safeParse(body);
        if (parsed.success) {
          return parsed.data;
        }
        logger.warn(
          { error: parsed.error.format() },
          "AI service returned invalid /internal/interview/turn payload; falling back to fake AI",
        );
      } else {
        logger.info(
          { status: res.status },
          "AI service /internal/interview/turn returned non-200; falling back to fake AI for Week 1",
        );
      }
    } catch (err) {
      logger.info(
        { err: (err as Error).message },
        "AI service unreachable; using fake AI for adaptive interview",
      );
    }
  }

  return runFakeAiInterviewTurn(validatedPayload);
}

