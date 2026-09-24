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
});
export type RunEvent = z.infer<typeof RunEvent>;
