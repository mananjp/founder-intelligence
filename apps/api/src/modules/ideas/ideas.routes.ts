import { Router } from "express";
import { requireWorkspace } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { createIdeaBody } from "./ideas.schema.js";
import { ideasService } from "./ideas.service.js";

export const ideasRouter = Router({ mergeParams: true });
ideasRouter.use(requireWorkspace);

ideasRouter.get("/", async (req, res) =>
  res.json({ data: await ideasService.list(req.workspaceId!) }),
);
ideasRouter.get("/:ideaId", async (req, res) =>
  res.json({
    data: await ideasService.get(req.workspaceId!, req.params.ideaId),
  }),
);
ideasRouter.post("/", validate({ body: createIdeaBody }), async (req, res) =>
  res
    .status(201)
    .json({
      data: await ideasService.create(req.workspaceId!, req.user!.id, req.body),
    }),
);
