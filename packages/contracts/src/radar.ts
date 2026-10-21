import { z } from "zod";

export const WatchItemKind = z.enum([
  "competitor",
  "customer",
  "demand",
  "technology",
  "regulatory",
  "funding",
  "category",
]);
export type WatchItemKind = z.infer<typeof WatchItemKind>;

export const WatchItem = z.object({
  id: z.string().uuid(),
  ideaId: z.string().uuid(),
  kind: WatchItemKind,
  target: z.string().min(1).max(500),
  frequencyHours: z.number().int().positive().default(168),
  lastCheckedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});
export type WatchItem = z.infer<typeof WatchItem>;

export const AlertSeverity = z.enum(["info", "notable", "significant"]);
export type AlertSeverity = z.infer<typeof AlertSeverity>;

export const Alert = z.object({
  id: z.string().uuid(),
  ideaId: z.string().uuid(),
  watchItemId: z.string().uuid().optional(),
  whatChanged: z.string().min(1),
  whyItMatters: z.string().min(1),
  suggestedAction: z.string().min(1),
  citedClaimIds: z.array(z.string().uuid()).default([]),
  severity: AlertSeverity.default("info"),
  createdAt: z.string().datetime(),
  readAt: z.string().datetime().optional(),
});
export type Alert = z.infer<typeof Alert>;
