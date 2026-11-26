import { z } from "zod";
import { ClaimStatus } from "./evidence.js";
import { DimensionKey } from "./opportunity.js";
import { ResearchDepth, RunState } from "./research.js";

export const ReportKind = z.enum(["quick_brief", "standard", "deep_dossier", "investor"]);
export type ReportKind = z.infer<typeof ReportKind>;

export const QuickBriefMetadata = z.object({
  reportType: z.literal("quick_brief"),
  ideaId: z.string().uuid(),
  ideaTitle: z.string(),
  ideaStage: z.string(),
  ideaCategory: z.string().nullable(),
  geography: z.array(z.string()),
  workspaceId: z.string().uuid(),
  workspaceName: z.string(),
  runId: z.string().uuid(),
  runDepth: ResearchDepth,
  runState: RunState,
  runCreatedAt: z.string().datetime(),
  runCompletedAt: z.string().datetime().nullable(),
  briefId: z.string().uuid().nullable(),
  briefVersion: z.number().int().positive().nullable(),
  generatedAt: z.string().datetime(),
  dataCoverageSummary: z.object({
    sourceCount: z.number().int().nonnegative(),
    evidenceCount: z.number().int().nonnegative(),
    claimCount: z.number().int().nonnegative(),
    competitorCount: z.number().int().nonnegative(),
    customerSegmentCount: z.number().int().nonnegative(),
    assumptionCount: z.number().int().nonnegative(),
    contradictionCount: z.number().int().nonnegative(),
  }),
});
export type QuickBriefMetadata = z.infer<typeof QuickBriefMetadata>;

export const QuickBriefVerdictStrength = z.object({
  statement: z.string(),
  status: ClaimStatus.optional(),
  claimId: z.string().uuid().optional(),
});
export type QuickBriefVerdictStrength = z.infer<typeof QuickBriefVerdictStrength>;

export const QuickBriefVerdictRisk = z.object({
  statement: z.string(),
  severity: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
});

export const QuickBriefNextAction = z.object({
  action: z.string(),
  rationale: z.string(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  source: z.enum(["recommendation", "derived_from_gaps"]),
});

export const QuickBriefExecutiveVerdict = z.object({
  verdictLabel: z.string(),
  summary: z.string(),
  strengths: z.array(QuickBriefVerdictStrength),
  risks: z.array(QuickBriefVerdictRisk),
  criticalUncertainties: z.array(z.string()),
  suggestedNextAction: QuickBriefNextAction.nullable(),
});
export type QuickBriefExecutiveVerdict = z.infer<typeof QuickBriefExecutiveVerdict>;

export const QuickBriefIcpSegment = z.object({
  id: z.string().uuid().optional(),
  name: z.string(),
  description: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  companySize: z.string().nullable().optional(),
  buyerPersona: z.string().nullable().optional(),
  userPersona: z.string().nullable().optional(),
  jobsToBeDone: z.array(z.string()),
});

export const QuickBriefIcp = z.object({
  status: z.enum(["established", "partial", "insufficient"]),
  summary: z.string(),
  primaryCustomer: z.string().nullable(),
  segments: z.array(QuickBriefIcpSegment),
  painPoints: z.array(z.string()),
  jobsToBeDone: z.array(z.string()),
  buyingMotivations: z.array(z.string()),
  customerEvidence: z.array(
    z.object({
      id: z.string().uuid(),
      statement: z.string(),
      status: ClaimStatus,
      quote: z.string().nullable().optional(),
    }),
  ),
  objectionsAndRisks: z.array(z.string()),
});
export type QuickBriefIcp = z.infer<typeof QuickBriefIcp>;

export const QuickBriefCompetitor = z.object({
  id: z.string().uuid(),
  name: z.string(),
  kind: z.string(),
  website: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  positioning: z.string().nullable().optional(),
  product: z.string().nullable().optional(),
  capabilities: z.array(z.string()),
  pricing: z.string().nullable().optional(),
  differentiation: z.string().nullable().optional(),
  strengths: z.array(z.string()),
  limitations: z.array(z.string()),
  evidenceRefs: z.array(z.string()),
});
export type QuickBriefCompetitor = z.infer<typeof QuickBriefCompetitor>;

export const QuickBriefCompetitiveLandscape = z.object({
  status: z.enum(["populated", "claims_only", "empty"]),
  summary: z.string(),
  alternativesSummary: z.string().nullable(),
  differentiationSummary: z.string().nullable(),
  competitors: z.array(QuickBriefCompetitor),
  competitiveClaims: z.array(
    z.object({
      id: z.string().uuid(),
      statement: z.string(),
      status: ClaimStatus,
    }),
  ),
});
export type QuickBriefCompetitiveLandscape = z.infer<
  typeof QuickBriefCompetitiveLandscape
>;

export const QuickBriefScoreDimension = z.object({
  key: DimensionKey,
  label: z.string(),
  score: z.number().min(0).max(10),
  evidenceCoverage: z.number().min(0).max(1),
  citedClaimIds: z.array(z.string().uuid()),
});
export type QuickBriefScoreDimension = z.infer<typeof QuickBriefScoreDimension>;

export const QuickBriefOpportunityScore = z.object({
  available: z.boolean(),
  overallScore: z.number().min(0).max(10).nullable(),
  evidenceCoverage: z.number().min(0).max(1).nullable(),
  scoringModelVersion: z.string().nullable(),
  scoredAt: z.string().datetime().nullable(),
  coverageAssessment: z.enum(["strong", "moderate", "weak", "unavailable"]),
  uncertaintyNotice: z.string(),
  dimensions: z.array(QuickBriefScoreDimension),
});
export type QuickBriefOpportunityScore = z.infer<
  typeof QuickBriefOpportunityScore
>;

export const QuickBriefAppendix = z.object({
  sources: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string().nullable(),
      url: z.string(),
      publisher: z.string().nullable(),
      sourceType: z.string(),
      publishedAt: z.string().nullable(),
      accessedAt: z.string().datetime(),
    }),
  ),
  evidenceSummaries: z.array(
    z.object({
      id: z.string().uuid(),
      claimText: z.string(),
      quote: z.string(),
      stance: z.string(),
      kind: z.string(),
      relevance: z.number(),
      sourceId: z.string().uuid(),
      sourceTitle: z.string().nullable(),
      sourceUrl: z.string(),
      observedAt: z.string().nullable(),
    }),
  ),
  claims: z.array(
    z.object({
      id: z.string().uuid(),
      module: z.string(),
      origin: z.string(),
      kind: z.string(),
      statement: z.string(),
      status: ClaimStatus,
      evidenceCount: z.number().int().nonnegative(),
    }),
  ),
  assumptions: z.array(
    z.object({
      id: z.string().uuid(),
      type: z.string(),
      statement: z.string(),
      importance: z.string(),
      status: z.string(),
    }),
  ),
  contradictions: z.array(
    z.object({
      claimId: z.string().uuid(),
      claimStatement: z.string(),
      contradictsClaimId: z.string().uuid(),
      contradictsStatement: z.string(),
      note: z.string().nullable(),
    }),
  ),
  unknowns: z.array(z.string()),
  researchLimitations: z.array(z.string()),
});
export type QuickBriefAppendix = z.infer<typeof QuickBriefAppendix>;

export const QuickBriefSections = z.object({
  metadata: QuickBriefMetadata,
  executiveVerdict: QuickBriefExecutiveVerdict,
  icp: QuickBriefIcp,
  competitiveLandscape: QuickBriefCompetitiveLandscape,
  opportunityScore: QuickBriefOpportunityScore,
  appendix: QuickBriefAppendix,
});
export type QuickBriefSections = z.infer<typeof QuickBriefSections>;

export const CreateReportBody = z.object({
  kind: z.literal("quick_brief").default("quick_brief"),
  force: z.boolean().default(false),
});
export type CreateReportBody = z.infer<typeof CreateReportBody>;

export const Report = z.object({
  id: z.string().uuid(),
  ideaId: z.string().uuid(),
  runId: z.string().uuid().optional(),
  kind: ReportKind.default("standard"),
  sections: z.record(z.string(), z.unknown()),
  exportUri: z.string().url().optional(),
  version: z.number().int().min(1).default(1),
  createdAt: z.string().datetime(),
});
export type Report = z.infer<typeof Report>;

export const QuickBriefReport = Report.extend({
  kind: z.literal("quick_brief"),
  sections: QuickBriefSections,
});
export type QuickBriefReport = z.infer<typeof QuickBriefReport>;

export const SubscriptionPlan = z.enum(["free", "pro", "enterprise"]);
export type SubscriptionPlan = z.infer<typeof SubscriptionPlan>;

export const SubscriptionStatus = z.enum(["active", "trialing", "past_due", "canceled"]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;

export const Subscription = z.object({
  workspaceId: z.string().uuid(),
  plan: SubscriptionPlan.default("free"),
  status: SubscriptionStatus.default("active"),
  provider: z.string().optional(),
  providerCustomerId: z.string().optional(),
  currentPeriodEnd: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
});
export type Subscription = z.infer<typeof Subscription>;

export const ActivityLog = z.object({
  id: z.string(),
  workspaceId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  action: z.string(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime(),
});
export type ActivityLog = z.infer<typeof ActivityLog>;
