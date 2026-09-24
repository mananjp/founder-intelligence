import { z } from "zod";
export const createIdeaBody = z.object({
  title: z.string().min(2).max(160),
  rawDescription: z.string().min(10).max(8000),
  geography: z.array(z.string()).default([]), // e.g. ["AE","IN-GJ"]; first-class research parameter
});
export type CreateIdeaBody = z.infer<typeof createIdeaBody>;
