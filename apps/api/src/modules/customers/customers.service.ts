import type { CustomerSegment, CustomerSegmentDetail } from "@fi/contracts";
import { HttpError } from "../../middleware/errorHandler.js";
import { ideasService } from "../ideas/ideas.service.js";
import { customersRepo } from "./customers.repo.js";

export const customersService = {
  async list(workspaceId: string, ideaId: string): Promise<CustomerSegment[]> {
    await ideasService.get(workspaceId, ideaId);
    return customersRepo.list(workspaceId, ideaId);
  },

  async get(
    workspaceId: string,
    ideaId: string,
    segmentId: string,
  ): Promise<CustomerSegmentDetail> {
    await ideasService.get(workspaceId, ideaId);
    const segment = await customersRepo.getWithClaims(
      workspaceId,
      ideaId,
      segmentId,
    );
    if (!segment) {
      throw new HttpError(404, "not_found", "Customer segment not found");
    }
    return segment;
  },
};
