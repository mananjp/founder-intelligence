import type { RequestHandler } from "express";
import { HttpError } from "../../middleware/errorHandler.js";
import { billingService } from "./billing.service.js";
import type { ResearchDepth } from "@fi/contracts";

export const enforcePlanLimits: RequestHandler = async (req, _res, next) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      throw new HttpError(400, "workspace_required", "Workspace ID is required");
    }
    const requestedDepth = (req.body?.depth as ResearchDepth | undefined) ?? "quick";
    await billingService.assertCanStartRun(workspaceId, requestedDepth);
    next();
  } catch (err) {
    next(err);
  }
};

