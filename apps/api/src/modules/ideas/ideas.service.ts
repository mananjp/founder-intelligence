import { HttpError } from "../../middleware/errorHandler.js";
import { ideasRepo } from "./ideas.repo.js";
import type { CreateIdeaBody } from "./ideas.schema.js";

export const ideasService = {
  list: (ws: string) => ideasRepo.list(ws),
  async get(ws: string, id: string) {
    const idea = await ideasRepo.get(ws, id);
    if (!idea) throw new HttpError(404, "not_found", "Idea not found");
    return idea;
  },
  create: (ws: string, userId: string, body: CreateIdeaBody) => ideasRepo.create(ws, userId, body),
};
