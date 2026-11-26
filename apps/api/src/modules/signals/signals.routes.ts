import { Router } from "express";
import { requireWorkspace } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { listSignalsQuery, type ListSignalsQuery } from "./signals.schema.js";
import { signalsService } from "./signals.service.js";

export const signalsRouter = Router({ mergeParams: true });
signalsRouter.use(requireWorkspace);

signalsRouter.get(
  "/",
  validate({ query: listSignalsQuery }),
  async (req, res) => {
    const { ideaId } = req.params as { ideaId: string };
    const query = listSignalsQuery.parse(req.query) as ListSignalsQuery;
    res.json({
      data: await signalsService.list(req.workspaceId!, ideaId, query),
    });
  },
);

signalsRouter.get("/:signalId", async (req, res) => {
  const { ideaId, signalId } = req.params as {
    ideaId: string;
    signalId: string;
  };
  res.json({
    data: await signalsService.get(req.workspaceId!, ideaId, signalId),
  });
});
