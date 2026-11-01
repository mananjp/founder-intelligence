import { withWorkspace } from "../../lib/db.js";
import { enqueueResearchRun } from "../../lib/queue.js";
import { publishRunEvent } from "../../lib/sse.js";
import { logger } from "../../lib/logger.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { ideasService } from "../ideas/ideas.service.js";
import { researchRepo } from "./research.repo.js";
import type { ResearchRun, StartResearchRun } from "@fi/contracts";

export const researchService = {
  async listRuns(workspaceId: string, ideaId: string): Promise<ResearchRun[]> {
    await ideasService.get(workspaceId, ideaId);
    return researchRepo.listRuns(workspaceId, ideaId);
  },

  async getRun(
    workspaceId: string,
    ideaId: string,
    runId: string,
  ): Promise<ResearchRun> {
    await ideasService.get(workspaceId, ideaId);
    const run = await researchRepo.getRun(workspaceId, ideaId, runId);
    if (!run) {
      throw new HttpError(404, "run_not_found", "Research run not found");
    }
    return run;
  },

  async startRun(
    workspaceId: string,
    ideaId: string,
    userId: string,
    data: StartResearchRun,
  ): Promise<ResearchRun> {
    await ideasService.get(workspaceId, ideaId);

    const briefId = await withWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query(
        "SELECT id FROM research_briefs WHERE idea_id = $1 ORDER BY version DESC LIMIT 1",
        [ideaId],
      );
      if (!rows[0]) {
        throw new HttpError(
          409,
          "brief_missing",
          "Complete the adaptive interview first",
        );
      }
      return rows[0].id as string;
    });

    const run = await researchRepo.createRun(
      workspaceId,
      ideaId,
      briefId,
      userId,
      data,
    );

    await publishRunEvent(run.id, {
      type: "stage.started",
      stage: "created",
      state: "created",
      note: "Research run queued",
    });

    try {
      await enqueueResearchRun(run.id);
    } catch (err) {
      logger.warn(
        { err, runId: run.id },
        "AI service enqueue failed; run recorded in database",
      );
    }

    return run;
  },

  async cancelRun(
    workspaceId: string,
    ideaId: string,
    runId: string,
  ): Promise<ResearchRun> {
    const existing = await this.getRun(workspaceId, ideaId, runId);

    if (existing.state === "completed") {
      throw new HttpError(
        409,
        "run_already_completed",
        "Cannot cancel an already completed research run",
      );
    }
    if (existing.state === "failed") {
      throw new HttpError(
        409,
        "run_already_failed",
        "Cannot cancel a failed research run",
      );
    }
    if (existing.state === "cancelled") {
      return existing;
    }

    const cancelledRun = await researchRepo.cancelRun(
      workspaceId,
      ideaId,
      runId,
    );
    if (!cancelledRun) {
      throw new HttpError(404, "run_not_found", "Research run not found");
    }

    await publishRunEvent(runId, {
      type: "run.finished",
      state: "cancelled",
      note: "Research run cancelled by user",
    });

    return cancelledRun;
  },
};

