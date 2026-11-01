import { Router } from "express";
import { requireWorkspace } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { HttpError } from "../../middleware/errorHandler.js";
import {
  PostInterviewTurnBody,
  FinalizeInterviewBriefBody,
} from "./interview.schema.js";
import { interviewService } from "./interview.service.js";

export const interviewRouter = Router({ mergeParams: true });
interviewRouter.use(requireWorkspace);

// GET /v1/workspaces/:workspaceId/ideas/:ideaId/interview
interviewRouter.get("/", async (req, res) => {
  const { ideaId } = req.params as { ideaId: string };
  const state = await interviewService.getInterviewState(
    req.workspaceId!,
    ideaId,
  );
  res.json({ data: state });
});

// POST /v1/workspaces/:workspaceId/ideas/:ideaId/interview/turns
interviewRouter.post(
  "/turns",
  validate({ body: PostInterviewTurnBody }),
  async (req, res) => {
    const { ideaId } = req.params as { ideaId: string };
    const result = await interviewService.addTurn(
      req.workspaceId!,
      ideaId,
      req.body.content,
      req.body.finalize,
    );
    res.status(201).json({ data: result });
  },
);

// POST /v1/workspaces/:workspaceId/ideas/:ideaId/interview/finalize
interviewRouter.post(
  "/finalize",
  validate({ body: FinalizeInterviewBriefBody.optional() }),
  async (req, res) => {
    const { ideaId } = req.params as { ideaId: string };
    const brief = await interviewService.finalizeBrief(
      req.workspaceId!,
      ideaId,
      req.body ?? {},
    );
    res.status(201).json({ data: brief });
  },
);

// GET /v1/workspaces/:workspaceId/ideas/:ideaId/interview/brief
interviewRouter.get("/brief", async (req, res) => {
  const { ideaId } = req.params as { ideaId: string };
  const brief = await interviewService.getLatestBrief(
    req.workspaceId!,
    ideaId,
  );
  if (!brief) {
    throw new HttpError(
      404,
      "brief_not_found",
      "No research brief found for this idea",
    );
  }
  res.json({ data: brief });
});
