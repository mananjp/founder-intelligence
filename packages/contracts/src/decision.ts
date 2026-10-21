import { z } from "zod";

export const AssumptionType = z.enum([
  "customer",
  "problem",
  "behavior",
  "value",
  "wtp",
  "distribution",
  "differentiation",
  "retention",
  "execution",
]);
export type AssumptionType = z.infer<typeof AssumptionType>;

export const AssumptionImportance = z.enum(["low", "medium", "high", "critical"]);
export type AssumptionImportance = z.infer<typeof AssumptionImportance>;

export const AssumptionStatus = z.enum([
  "unverified",
  "testing",
  "supported",
  "weakened",
  "rejected",
  "accepted",
]);
export type AssumptionStatus = z.infer<typeof AssumptionStatus>;

export const Assumption = z.object({
  id: z.string().uuid(),
  ideaId: z.string().uuid(),
  type: AssumptionType,
  statement: z.string().min(5).max(1000),
  importance: AssumptionImportance.default("medium"),
  status: AssumptionStatus.default("unverified"),
  linkedClaimIds: z.array(z.string().uuid()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Assumption = z.infer<typeof Assumption>;

export const ExperimentMethod = z.enum([
  "interviews",
  "landing_page",
  "waitlist",
  "price_test",
  "concierge",
  "prototype",
  "switch_test",
  "channel_test",
  "preorder",
]);
export type ExperimentMethod = z.infer<typeof ExperimentMethod>;

export const ExperimentStatus = z.enum(["proposed", "running", "completed", "abandoned"]);
export type ExperimentStatus = z.infer<typeof ExperimentStatus>;

export const Experiment = z.object({
  id: z.string().uuid(),
  ideaId: z.string().uuid(),
  assumptionId: z.string().uuid().optional(),
  method: ExperimentMethod,
  hypothesis: z.string().min(5).max(2000),
  expectedLearning: z.number().min(0).max(1).optional(),
  decisionImpact: z.number().min(0).max(1).optional(),
  costTime: z.number().min(0).optional(),
  priorityScore: z.number().optional(),
  status: ExperimentStatus.default("proposed"),
  result: z.string().optional(),
  createdAt: z.string().datetime(),
});
export type Experiment = z.infer<typeof Experiment>;

export const Recommendation = z.object({
  id: z.string().uuid(),
  ideaId: z.string().uuid(),
  runId: z.string().uuid().optional(),
  action: z.string(),
  rationale: z.string(),
  citedClaimIds: z.array(z.string().uuid()).default([]),
  linkedAssumptionIds: z.array(z.string().uuid()).default([]),
  confidence: z.number().min(0).max(1).optional(),
  createdAt: z.string().datetime(),
});
export type Recommendation = z.infer<typeof Recommendation>;

export const Decision = z.object({
  id: z.string().uuid(),
  ideaId: z.string().uuid(),
  recommendationId: z.string().uuid().optional(),
  choice: z.string(),
  rationale: z.string().optional(),
  decidedBy: z.string().uuid(),
  linkedAssumptionIds: z.array(z.string().uuid()).default([]),
  citedClaimIds: z.array(z.string().uuid()).default([]),
  createdAt: z.string().datetime(),
});
export type Decision = z.infer<typeof Decision>;
