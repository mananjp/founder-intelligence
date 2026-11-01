import { z } from "zod";

export const InterviewTurnRole = z.enum(["founder", "assistant"]);
export type InterviewTurnRole = z.infer<typeof InterviewTurnRole>;

export const InterviewTurn = z.object({
  id: z.string().uuid(),
  ideaId: z.string().uuid(),
  turnIndex: z.number().int().nonnegative(),
  role: InterviewTurnRole,
  content: z.string(),
  extracted: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string().datetime().optional(),
});
export type InterviewTurn = z.infer<typeof InterviewTurn>;

export const PostInterviewTurnBody = z.object({
  content: z.string().min(1).max(10000),
  finalize: z.boolean().optional(),
});
export type PostInterviewTurnBody = z.infer<typeof PostInterviewTurnBody>;

export const ResearchBrief = z.object({
  id: z.string().uuid(),
  ideaId: z.string().uuid(),
  version: z.number().int().positive(),
  problem: z.string().nullable().optional(),
  customer: z.string().nullable().optional(),
  geography: z.array(z.string()).default([]),
  category: z.string().nullable().optional(),
  alternatives: z.string().nullable().optional(),
  businessModel: z.string().nullable().optional(),
  differentiation: z.string().nullable().optional(),
  knownEvidence: z.array(z.unknown()).default([]),
  unknowns: z.array(z.unknown()).default([]),
  researchQuestions: z.array(z.unknown()).default([]),
  createdAt: z.string().datetime().optional(),
});
export type ResearchBrief = z.infer<typeof ResearchBrief>;

export const FinalizeInterviewBriefBody = z.object({
  problem: z.string().nullable().optional(),
  customer: z.string().nullable().optional(),
  geography: z.array(z.string()).nullable().optional(),
  category: z.string().nullable().optional(),
  alternatives: z.string().nullable().optional(),
  businessModel: z.string().nullable().optional(),
  differentiation: z.string().nullable().optional(),
  knownEvidence: z.array(z.unknown()).nullable().optional(),
  unknowns: z.array(z.unknown()).nullable().optional(),
  researchQuestions: z.array(z.unknown()).nullable().optional(),
});
export type FinalizeInterviewBriefBody = z.infer<
  typeof FinalizeInterviewBriefBody
>;

export const InterviewSessionState = z.object({
  ideaId: z.string().uuid(),
  turns: z.array(InterviewTurn),
  extractedVariables: z.record(z.string(), z.unknown()),
  isComplete: z.boolean(),
  latestBrief: ResearchBrief.nullable().optional(),
});
export type InterviewSessionState = z.infer<typeof InterviewSessionState>;

export const PostInterviewTurnResponse = z.object({
  founderTurn: InterviewTurn,
  assistantTurn: InterviewTurn,
  extractedVariables: z.record(z.string(), z.unknown()),
  isComplete: z.boolean(),
  draftBrief: z
    .object({
      problem: z.string().nullable().optional(),
      customer: z.string().nullable().optional(),
      geography: z.array(z.string()).optional(),
      category: z.string().nullable().optional(),
      alternatives: z.string().nullable().optional(),
      businessModel: z.string().nullable().optional(),
      differentiation: z.string().nullable().optional(),
      knownEvidence: z.array(z.unknown()).default([]),
      unknowns: z.array(z.unknown()).default([]),
      researchQuestions: z.array(z.unknown()).default([]),
    })
    .optional(),
  finalizedBrief: ResearchBrief.optional(),
});
export type PostInterviewTurnResponse = z.infer<
  typeof PostInterviewTurnResponse
>;

export const AiInterviewTurnPayload = z.object({
  ideaId: z.string().uuid(),
  ideaTitle: z.string(),
  rawDescription: z.string(),
  geography: z.array(z.string()).default([]),
  turnHistory: z.array(
    z.object({
      role: InterviewTurnRole,
      content: z.string(),
      extracted: z.record(z.string(), z.unknown()).nullable().optional(),
    }),
  ),
  founderMessage: z.string(),
});
export type AiInterviewTurnPayload = z.infer<typeof AiInterviewTurnPayload>;

export const AiInterviewTurnResult = z.object({
  question: z.string(),
  extracted: z.record(z.string(), z.unknown()).default({}),
  isComplete: z.boolean().default(false),
  draftBrief: z
    .object({
      problem: z.string().nullable().optional(),
      customer: z.string().nullable().optional(),
      geography: z.array(z.string()).optional(),
      category: z.string().nullable().optional(),
      alternatives: z.string().nullable().optional(),
      businessModel: z.string().nullable().optional(),
      differentiation: z.string().nullable().optional(),
      knownEvidence: z.array(z.unknown()).default([]),
      unknowns: z.array(z.unknown()).default([]),
      researchQuestions: z.array(z.unknown()).default([]),
    })
    .optional(),
});
export type AiInterviewTurnResult = z.infer<typeof AiInterviewTurnResult>;
