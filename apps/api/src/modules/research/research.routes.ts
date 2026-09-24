import { Router } from "express";
import { z } from "zod";
import { requireWorkspace } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { withWorkspace } from "../../lib/db.js";
import { enqueueResearchRun } from "../../lib/queue.js";
import { streamRunEvents } from "../../lib/sse.js";
import { HttpError } from "../../middleware/errorHandler.js";

export const researchRouter = Router({ mergeParams: true });
researchRouter.use(requireWorkspace);

const startBody = z.object({
  depth: z.enum(["quick", "standard", "deep"]).default("quick"),
  geography: z.array(z.string()).min(1),
  goals: z.array(z.string()).default([]),
});

// POST /v1/workspaces/:workspaceId/ideas/:ideaId/research/runs
researchRouter.post(
  "/runs",
  validate({ body: startBody }),
  async (req, res) => {
    const { ideaId } = req.params as { ideaId: string };
    const run = await withWorkspace(req.workspaceId!, async (c) => {
      const brief = await c.query(
        "SELECT id FROM research_briefs WHERE idea_id=$1 ORDER BY version DESC LIMIT 1",
        [ideaId],
      );
      if (!brief.rows[0])
        throw new HttpError(
          409,
          "brief_missing",
          "Complete the adaptive interview first",
        );
      return (
        await c.query(
          `INSERT INTO research_runs (workspace_id, idea_id, brief_id, depth, geography, state, created_by)
       VALUES ($1,$2,$3,$4,$5,'created',$6) RETURNING id, state, depth`,
          [
            req.workspaceId,
            ideaId,
            brief.rows[0].id,
            req.body.depth,
            req.body.geography,
            req.user!.id,
          ],
        )
      ).rows[0];
    });
    await enqueueResearchRun(run.id);
    res.status(202).json({ data: run });
  },
);

// GET .../research/runs/:runId/events  (Server-Sent Events)
researchRouter.get("/runs/:runId/events", async (req, res) => {
  await streamRunEvents(req.params.runId as string, res);
});
