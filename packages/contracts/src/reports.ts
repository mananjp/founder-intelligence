import { z } from "zod";

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
