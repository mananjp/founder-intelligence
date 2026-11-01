import { Router } from "express";
import { StartResearchRun } from "@fi/contracts";
import { requireWorkspace } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { streamRunEvents } from "../../lib/sse.js";
import { researchService } from "./research.service.js";

export const researchRouter = Router({ mergeParams: true });
researchRouter.use(requireWorkspace);

// POST /v1/workspaces/:workspaceId/ideas/:ideaId/research/runs
researchRouter.post(
  "/runs",
  validate({ body: StartResearchRun }),
  async (req, res) => {
    const { ideaId } = req.params as { ideaId: string };
    const run = await researchService.startRun(
      req.workspaceId!,
      ideaId,
      req.user!.id,
      req.body,
    );
    res.status(202).json({ data: run });
  },
);

// GET /v1/workspaces/:workspaceId/ideas/:ideaId/research/runs
researchRouter.get("/runs", async (req, res) => {
  const { ideaId } = req.params as { ideaId: string };
  const runs = await researchService.listRuns(req.workspaceId!, ideaId);
  res.json({ data: runs });
});

// GET /v1/workspaces/:workspaceId/ideas/:ideaId/research/runs/:runId
researchRouter.get("/runs/:runId", async (req, res) => {
  const { ideaId, runId } = req.params as { ideaId: string; runId: string };
  const run = await researchService.getRun(req.workspaceId!, ideaId, runId);
  res.json({ data: run });
});

// POST /v1/workspaces/:workspaceId/ideas/:ideaId/research/runs/:runId/cancel
researchRouter.post("/runs/:runId/cancel", async (req, res) => {
  const { ideaId, runId } = req.params as { ideaId: string; runId: string };
  const run = await researchService.cancelRun(req.workspaceId!, ideaId, runId);
  res.json({ data: run });
});

// GET /v1/workspaces/:workspaceId/ideas/:ideaId/research/runs/:runId/events (Server-Sent Events)
researchRouter.get("/runs/:runId/events", async (req, res) => {
  const { ideaId, runId } = req.params as { ideaId: string; runId: string };
  // Verify run belongs to this workspace and idea
  await researchService.getRun(req.workspaceId!, ideaId, runId);

  const rawLastId =
    (req.headers["last-event-id"] as string | undefined) ??
    (req.query.lastEventId as string | undefined);

  await streamRunEvents(runId, res, {
    lastEventId: rawLastId ? String(rawLastId).trim() : undefined,
  });
});
