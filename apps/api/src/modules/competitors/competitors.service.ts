import type { Competitor, CompetitorDetail } from "@fi/contracts";
import { HttpError } from "../../middleware/errorHandler.js";
import { ideasService } from "../ideas/ideas.service.js";
import { competitorsRepo } from "./competitors.repo.js";
import type { ListCompetitorsQuery } from "./competitors.schema.js";

export const competitorsService = {
  async list(
    workspaceId: string,
    ideaId: string,
    query: ListCompetitorsQuery = {},
  ): Promise<Competitor[]> {
    await ideasService.get(workspaceId, ideaId);
    return competitorsRepo.list(workspaceId, ideaId, query);
  },

  async get(
    workspaceId: string,
    ideaId: string,
    competitorId: string,
  ): Promise<CompetitorDetail> {
    await ideasService.get(workspaceId, ideaId);
    const competitor = await competitorsRepo.getWithClaims(
      workspaceId,
      ideaId,
      competitorId,
    );
    if (!competitor) {
      throw new HttpError(404, "not_found", "Competitor not found");
    }
    return competitor;
  },
};
