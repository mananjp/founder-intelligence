import { ideasService } from "../ideas/ideas.service.js";
import { queryAiInterviewTurn } from "./interview.ai.js";
import { interviewRepo } from "./interview.repo.js";
import type {
  FinalizeInterviewBriefBodyType,
  InterviewSessionStateType,
  PostInterviewTurnResponseType,
  ResearchBriefType,
} from "./interview.schema.js";

export const interviewService = {
  async getInterviewState(
    workspaceId: string,
    ideaId: string,
  ): Promise<InterviewSessionStateType> {
    // Verify idea exists and belongs to workspace (throws 404 if not found)
    await ideasService.get(workspaceId, ideaId);

    const turns = await interviewRepo.listTurns(workspaceId, ideaId);
    const latestBrief = await interviewRepo.getLatestBrief(workspaceId, ideaId);

    const extractedVariables: Record<string, unknown> = {};
    for (const t of turns) {
      if (t.extracted && typeof t.extracted === "object") {
        Object.assign(extractedVariables, t.extracted);
      }
    }

    const isComplete =
      latestBrief !== null ||
      (Boolean(extractedVariables.problem && extractedVariables.customer) &&
        turns.length >= 4);

    return {
      ideaId,
      turns,
      extractedVariables,
      isComplete,
      latestBrief,
    };
  },

  async addTurn(
    workspaceId: string,
    ideaId: string,
    content: string,
    finalize?: boolean,
  ): Promise<PostInterviewTurnResponseType> {
    const idea = await ideasService.get(workspaceId, ideaId);
    const existingTurns = await interviewRepo.listTurns(workspaceId, ideaId);

    const nextFounderIndex =
      existingTurns.length > 0
        ? Math.max(...existingTurns.map((t) => t.turnIndex)) + 1
        : 0;

    const founderTurn = await interviewRepo.createTurn(workspaceId, {
      ideaId,
      turnIndex: nextFounderIndex,
      role: "founder",
      content,
    });

    const aiRes = await queryAiInterviewTurn({
      ideaId,
      ideaTitle: idea.title,
      rawDescription: idea.raw_description,
      geography: idea.geography ?? [],
      turnHistory: [...existingTurns, founderTurn],
      founderMessage: content,
    });

    const assistantTurn = await interviewRepo.createTurn(workspaceId, {
      ideaId,
      turnIndex: nextFounderIndex + 1,
      role: "assistant",
      content: aiRes.question,
      extracted: aiRes.extracted,
    });

    const allTurns = [...existingTurns, founderTurn, assistantTurn];
    const extractedVariables: Record<string, unknown> = {};
    for (const t of allTurns) {
      if (t.extracted && typeof t.extracted === "object") {
        Object.assign(extractedVariables, t.extracted);
      }
    }

    let finalizedBrief: ResearchBriefType | undefined;
    if (finalize) {
      finalizedBrief = await this.finalizeBrief(
        workspaceId,
        ideaId,
        aiRes.draftBrief,
      );
    }

    return {
      founderTurn,
      assistantTurn,
      extractedVariables,
      isComplete: aiRes.isComplete || Boolean(finalizedBrief),
      draftBrief: aiRes.draftBrief,
      finalizedBrief,
    };
  },

  async finalizeBrief(
    workspaceId: string,
    ideaId: string,
    overrides?: FinalizeInterviewBriefBodyType,
  ): Promise<ResearchBriefType> {
    const idea = await ideasService.get(workspaceId, ideaId);
    const turns = await interviewRepo.listTurns(workspaceId, ideaId);

    const extractedVariables: Record<string, unknown> = {};
    for (const t of turns) {
      if (t.extracted && typeof t.extracted === "object") {
        Object.assign(extractedVariables, t.extracted);
      }
    }

    const problem =
      overrides?.problem ??
      (extractedVariables.problem as string | undefined) ??
      idea.raw_description;

    const customer =
      overrides?.customer ??
      (extractedVariables.customer as string | undefined) ??
      "Early stage founders and innovation teams";

    const geography =
      overrides?.geography ??
      (extractedVariables.geography as string[] | undefined) ??
      idea.geography ??
      [];

    const category =
      overrides?.category ??
      (extractedVariables.category as string | undefined) ??
      idea.category ??
      "Software & AI";

    const alternatives =
      overrides?.alternatives ??
      (extractedVariables.alternatives as string | undefined) ??
      "Manual processes, bespoke consulting, and general productivity software";

    const businessModel =
      overrides?.businessModel ??
      (extractedVariables.businessModel as string | undefined) ??
      "B2B SaaS subscription tier";

    const differentiation =
      overrides?.differentiation ??
      (extractedVariables.differentiation as string | undefined) ??
      "Verifiable evidence-backed vertical intelligence pipeline";

    const knownEvidence = overrides?.knownEvidence ?? [
      {
        statement: `Intake and interview data gathered for ${idea.title}`,
        source: "adaptive_interview",
      },
    ];

    const unknowns = overrides?.unknowns ?? [
      "Target customer willingness to pay benchmark",
      "Incumbent switching resistance",
    ];

    const geoStr = geography.length > 0 ? geography.join(", ") : "target market";
    const researchQuestions = overrides?.researchQuestions ?? [
      {
        question: `What is the validated TAM/SAM for ${idea.title} in ${geoStr}?`,
        priority: "high",
      },
      {
        question: "Who are the top direct and indirect competitors?",
        priority: "high",
      },
      {
        question: "What are customer pricing expectations and willingness to pay?",
        priority: "medium",
      },
    ];

    return interviewRepo.createBrief(workspaceId, ideaId, {
      problem,
      customer,
      geography,
      category,
      alternatives,
      businessModel,
      differentiation,
      knownEvidence,
      unknowns,
      researchQuestions,
    });
  },

  async getLatestBrief(
    workspaceId: string,
    ideaId: string,
  ): Promise<ResearchBriefType | null> {
    await ideasService.get(workspaceId, ideaId);
    return interviewRepo.getLatestBrief(workspaceId, ideaId);
  },
};

