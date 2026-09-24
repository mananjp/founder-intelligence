import { z } from "zod";

export const DimensionKey = z.enum([
  "problem_severity", "market_attractiveness", "customer_willingness", "competitive_pressure",
  "differentiation", "timing", "monetization", "distribution_feasibility", "defensibility", "execution_fit",
]);

export const DimensionScore = z.object({
  score: z.number().min(0).max(10),
  evidenceCoverage: z.number().min(0).max(1),
  citedClaimIds: z.array(z.string().uuid()),
});

export const OpportunityScore = z.object({
  ideaId: z.string().uuid(),
  overallScore: z.number().min(0).max(10),
  evidenceCoverage: z.number().min(0).max(1),
  dimensions: z.record(DimensionKey, DimensionScore),
  scoringModelVersion: z.string(),
});
export type OpportunityScore = z.infer<typeof OpportunityScore>;
