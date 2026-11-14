import { Router } from "express";
import { PLAN_TIERS } from "@fi/contracts";
import { requireWorkspace } from "../../middleware/auth.js";
import { billingService } from "./billing.service.js";

export const billingRouter = Router({ mergeParams: true });
billingRouter.use(requireWorkspace);

// GET /v1/workspaces/:workspaceId/billing/usage
billingRouter.get("/usage", async (req, res) => {
  const usage = await billingService.getUsage(req.workspaceId!);
  res.json({ data: usage });
});

// GET /v1/workspaces/:workspaceId/billing/tiers
billingRouter.get("/tiers", (_req, res) => {
  res.json({ data: PLAN_TIERS });
});

