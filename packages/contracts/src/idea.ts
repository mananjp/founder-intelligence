import { z } from "zod";

export const CreateIdea = z.object({
  title: z.string().min(2).max(160),
  rawDescription: z.string().min(10).max(8000),
  geography: z.array(z.string()).default([]),
});
export type CreateIdea = z.infer<typeof CreateIdea>;

export const Idea = CreateIdea.extend({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  stage: z.enum(["exploring", "validating", "building", "live"]),
  createdAt: z.string().datetime(),
});
export type Idea = z.infer<typeof Idea>;
