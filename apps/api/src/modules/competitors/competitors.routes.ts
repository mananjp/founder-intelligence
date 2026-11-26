import { Router } from "express";
import { requireWorkspace } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  listCompetitorsQuery,
  type ListCompetitorsQuery,
} from "./competitors.schema.js";
import { competitorsService } from "./competitors.service.js";

export const competitorsRouter = Router({ mergeParams: true });
competitorsRouter.use(requireWorkspace);

competitorsRouter.get(
  "/",
  validate({ query: listCompetitorsQuery }),
  async (req, res) => {
    const { ideaId } = req.params as { ideaId: string };
    const query = listCompetitorsQuery.parse(req.query) as ListCompetitorsQuery;
    res.json({
      data: await competitorsService.list(req.workspaceId!, ideaId, query),
    });
  },
);

competitorsRouter.get("/:competitorId", async (req, res) => {
  const { ideaId, competitorId } = req.params as {
    ideaId: string;
    competitorId: string;
  };
  res.json({
    data: await competitorsService.get(req.workspaceId!, ideaId, competitorId),
  });
});
