import { z } from "zod";

export const ResearchDepth = z.enum(["quick", "standard", "deep"]);

export const StartResearchRun = z.object({
  depth: ResearchDepth.default("quick"),
  geography: z.array(z.string()).min(1),
  goals: z.array(z.string()).default([]),
});
export type StartResearchRun = z.infer<typeof StartResearchRun>;

/** Mirrors fi_ai.research.state.RunState */
export const RunState = z.enum([
  "created",
  "scoping",
  "planning",
  "discovering",
  "fetching",
  "extracting",
  "crosschecking",
  "synthesizing",
  "recommending",
  "completed",
  "partial",
  "failed",
  "cancelled",
]);

export const RunEvent = z.object({
  type: z.enum([
    "stage.started",
    "stage.progress",
    "stage.completed",
    "stage.failed",
    "run.finished",
  ]),
  stage: z.string().optional(),
  note: z.string().optional(),
  error: z.string().optional(),
  state: RunState.optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string().optional(),
}).passthrough();
export type RunEvent = z.infer<typeof RunEvent>;

export const ResearchRun = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  ideaId: z.string().uuid(),
  briefId: z.string().uuid(),
  depth: ResearchDepth,
  geography: z.array(z.string()),
  state: RunState,
  budgetUsd: z.number().nullable().optional(),
  spentUsd: z.number().default(0),
  lastCompletedStage: z.string().nullable().optional(),
  cancelRequestedAt: z.string().datetime().nullable().optional(),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().optional(),
});
export type ResearchRun = z.infer<typeof ResearchRun>;
