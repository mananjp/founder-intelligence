import { Router } from "express";
import { requireWorkspace } from "../../middleware/auth.js";
import { customersService } from "./customers.service.js";

export const customersRouter = Router({ mergeParams: true });
customersRouter.use(requireWorkspace);

customersRouter.get("/", async (req, res) => {
  const { ideaId } = req.params as { ideaId: string };
  res.json({
    data: await customersService.list(req.workspaceId!, ideaId),
  });
});

customersRouter.get("/:segmentId", async (req, res) => {
  const { ideaId, segmentId } = req.params as {
    ideaId: string;
    segmentId: string;
  };
  res.json({
    data: await customersService.get(req.workspaceId!, ideaId, segmentId),
  });
});
