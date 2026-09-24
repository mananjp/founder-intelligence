import { z } from "zod";

/** Mirrors fi_ai.evidence.schemas.ClaimStatus — keep in lockstep with apps/ai/src/fi_ai/evidence/schemas.py */
export const ClaimStatus = z.enum([
  "verified", "supported", "directional", "conflicting", "inferred", "assumption", "unverified",
]);
export type ClaimStatus = z.infer<typeof ClaimStatus>;

export const SourceType = z.enum([
  "official_site", "government", "filing", "academic", "review", "community",
  "search_trend", "industry_report", "news", "job_posting", "developer", "user_upload", "other",
]);

export const Claim = z.object({
  id: z.string().uuid(),
  ideaId: z.string().uuid(),
  statement: z.string(),
  module: z.enum(["market", "customer", "competitive", "demand", "pricing", "gtm"]),
  status: ClaimStatus,
  evidenceIds: z.array(z.string().uuid()),
});
export type Claim = z.infer<typeof Claim>;
