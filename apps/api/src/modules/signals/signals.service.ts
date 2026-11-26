import type { Signal, SignalDetail } from "@fi/contracts";
import { HttpError } from "../../middleware/errorHandler.js";
import { ideasService } from "../ideas/ideas.service.js";
import { signalsRepo } from "./signals.repo.js";
import type { ListSignalsQuery } from "./signals.schema.js";

export const signalsService = {
  async list(
    workspaceId: string,
    ideaId: string,
    query: ListSignalsQuery = {},
  ): Promise<Signal[]> {
    await ideasService.get(workspaceId, ideaId);
    return signalsRepo.list(workspaceId, ideaId, query);
  },

  async get(
    workspaceId: string,
    ideaId: string,
    signalId: string,
  ): Promise<SignalDetail> {
    await ideasService.get(workspaceId, ideaId);
    const signal = await signalsRepo.getWithClaims(
      workspaceId,
      ideaId,
      signalId,
    );
    if (!signal) {
      throw new HttpError(404, "not_found", "Signal not found");
    }
    return signal;
  },
};
