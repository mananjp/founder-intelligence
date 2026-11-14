import { z } from "zod";
import { ResearchDepth } from "./research";

export const ReportKind = z.enum(["quick_brief", "standard", "deep_dossier", "investor"]);
export type ReportKind = z.infer<typeof ReportKind>;

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

export const PlanTier = z.object({
  id: SubscriptionPlan,
  name: z.string(),
  description: z.string(),
  priceMonthlyUsd: z.number().min(0),
  runsPerMonth: z.number().int().min(0),
  allowedDepths: z.array(ResearchDepth),
  features: z.array(z.string()),
});
export type PlanTier = z.infer<typeof PlanTier>;

export const PLAN_TIERS: Record<SubscriptionPlan, PlanTier> = {
  free: {
    id: "free",
    name: "Free / Explorer",
    description: "Limited validations, basic market snapshot and guided first research.",
    priceMonthlyUsd: 0,
    runsPerMonth: 5,
    allowedDepths: ["quick"],
    features: [
      "Guided Adaptive Interview",
      "5 Quick Research Runs / month",
      "Basic Market & Competitor Snapshots",
      "Evidence Vault (Read-only)",
    ],
  },
  pro: {
    id: "pro",
    name: "Founder / Pro",
    description: "Deeper research, saved projects, reports, competitor monitoring and experiments.",
    priceMonthlyUsd: 49,
    runsPerMonth: 30,
    allowedDepths: ["quick", "standard"],
    features: [
      "All Free features",
      "30 Standard Research Runs / month",
      "Comprehensive Competitor & Customer Matrices",
      "Opportunity Scorecards & Assumptions Tracking",
      "Executive Brief PDF Exports",
      "Continuous Market Radar (Up to 5 items)",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Team / Enterprise",
    description: "Custom intelligence, deep research dossiers, multi-seat collaboration and support.",
    priceMonthlyUsd: 199,
    runsPerMonth: 200,
    allowedDepths: ["quick", "standard", "deep"],
    features: [
      "All Pro features",
      "200 Deep Research Runs / month",
      "Full Deep Dossier Reports",
      "Unlimited Continuous Radar & Signals",
      "Team Workspaces & Multi-seat Collaboration",
      "Priority Research Processing & Dedicated Support",
    ],
  },
};

export const WorkspaceUsage = z.object({
  workspaceId: z.string().uuid(),
  plan: SubscriptionPlan,
  status: SubscriptionStatus,
  runsUsed: z.number().int().min(0),
  runsLimit: z.number().int().min(0),
  allowedDepths: z.array(ResearchDepth),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime().optional(),
});
export type WorkspaceUsage = z.infer<typeof WorkspaceUsage>;

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
