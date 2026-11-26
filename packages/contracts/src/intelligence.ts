import { z } from "zod";
import { Claim } from "./evidence.js";

/**
 * Five strategic competitor classes defined in Product Bible §13:
 * - direct: solves substantially the same problem for a similar customer
 * - indirect: solves the same underlying need differently
 * - substitute: a different behavior or product customers can use instead
 * - emerging: new entrant or adjacent product showing relevant movement
 * - internal_diy: spreadsheet, manual process, employee or internal workaround
 */
export const CompetitorClass = z.enum([
  "direct",
  "indirect",
  "substitute",
  "emerging",
  "internal_diy",
]);
export type CompetitorClass = z.infer<typeof CompetitorClass>;

export const Competitor = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  ideaId: z.string().uuid(),
  name: z.string().min(1).max(200),
  website: z.string().url().nullable().optional(),
  kind: CompetitorClass.default("direct"),
  description: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Competitor = z.infer<typeof Competitor>;

export const CompetitorDetail = Competitor.extend({
  linkedClaims: z.array(Claim),
});
export type CompetitorDetail = z.infer<typeof CompetitorDetail>;

export const CustomerSegment = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  ideaId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  companySize: z.string().nullable().optional(),
  buyerPersona: z.string().nullable().optional(),
  userPersona: z.string().nullable().optional(),
  jobsToBeDone: z
    .array(z.union([z.string(), z.record(z.string(), z.unknown())]))
    .default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CustomerSegment = z.infer<typeof CustomerSegment>;

export const CustomerSegmentDetail = CustomerSegment.extend({
  linkedClaims: z.array(Claim),
});
export type CustomerSegmentDetail = z.infer<typeof CustomerSegmentDetail>;

/** Demand & trend signal categories from Product Bible §14. */
export const SignalType = z.enum([
  "search_interest",
  "community_discussion",
  "review_volume",
  "product_launch",
  "developer_activity",
  "funding",
  "hiring",
  "news",
  "competitor_change",
  "technology_adoption",
  "customer_pain",
  "other",
]);
export type SignalType = z.infer<typeof SignalType>;

export const SignalStrength = z.enum(["low", "medium", "high"]);
export type SignalStrength = z.infer<typeof SignalStrength>;

export const Signal = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  ideaId: z.string().uuid(),
  runId: z.string().uuid().nullable().optional(),
  sourceId: z.string().uuid().nullable().optional(),
  signalType: SignalType,
  title: z.string().min(1).max(300),
  description: z.string().min(1),
  strength: SignalStrength.default("medium"),
  observedAt: z.string().datetime().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
});
export type Signal = z.infer<typeof Signal>;

export const SignalDetail = Signal.extend({
  linkedClaims: z.array(Claim),
});
export type SignalDetail = z.infer<typeof SignalDetail>;
