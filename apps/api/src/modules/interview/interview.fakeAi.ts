import type {
  AiInterviewTurnPayloadType,
  AiInterviewTurnResultType,
} from "./interview.schema.js";

/**
 * Deterministic fake AI for Week 1 (and offline/test fallback).
 * Evaluates missing variables and asks 1 focused question at a time
 * until sufficient context is gathered to produce a draft ResearchBrief.
 */
export function runFakeAiInterviewTurn(
  payload: AiInterviewTurnPayloadType,
): AiInterviewTurnResultType {
  const { ideaTitle, rawDescription, geography, turnHistory, founderMessage } =
    payload;

  // Aggregate previously extracted variables from turn history
  const previouslyExtracted: Record<string, unknown> = {};
  for (const turn of turnHistory) {
    if (turn.extracted && typeof turn.extracted === "object") {
      Object.assign(previouslyExtracted, turn.extracted);
    }
  }

  const founderTurnsCount = turnHistory.filter(
    (t) => t.role === "founder",
  ).length;

  const newlyExtracted: Record<string, unknown> = {};

  if (turnHistory.length === 0) {
    // Opening founder greeting / start
    const msg = founderMessage.trim();
    if (
      msg.length > 15 &&
      (msg.toLowerCase().includes("customer") ||
        msg.toLowerCase().includes("target") ||
        msg.toLowerCase().includes("for "))
    ) {
      newlyExtracted.customer = msg;
      return {
        question:
          "What is the single most critical pain point or bottleneck that makes this problem urgent for them to solve?",
        extracted: newlyExtracted,
        isComplete: false,
      };
    }
    return {
      question: `Great concept with "${ideaTitle}". Who is your primary target customer or buyer persona, and what is the specific segment you'll focus on first?`,
      extracted: newlyExtracted,
      isComplete: false,
    };
  }

  if (turnHistory.length === 1 && founderTurnsCount === 0) {
    // Assistant asked opening question, founder is replying with customer
    newlyExtracted.customer = founderMessage;
    return {
      question:
        "What is the single most critical pain point or bottleneck that makes this problem urgent for them to solve?",
      extracted: newlyExtracted,
      isComplete: false,
    };
  }

  if (founderTurnsCount === 1) {
    // Founder is providing problem
    newlyExtracted.problem = founderMessage;
    return {
      question:
        "How do these target customers address this problem today? What existing solutions, tools, or manual workarounds do they rely on?",
      extracted: newlyExtracted,
      isComplete: false,
    };
  }

  if (founderTurnsCount === 2) {
    // Founder is providing alternatives
    newlyExtracted.alternatives = founderMessage;
    return {
      question:
        "What is your intended monetization model (e.g. B2B SaaS subscription, usage-based, marketplace commission)?",
      extracted: newlyExtracted,
      isComplete: false,
    };
  }

  // founderTurnsCount >= 3: Founder is providing business model & completing the interview
  newlyExtracted.businessModel = founderMessage;
  const allExtracted = {
    ...previouslyExtracted,
    ...newlyExtracted,
  };

  const problemSummary = String(
    allExtracted.problem ?? rawDescription,
  ).slice(0, 500);
  const customerSummary = String(
    allExtracted.customer ?? "Early stage founders and innovation teams",
  ).slice(0, 300);
  const alternativesSummary = String(
    allExtracted.alternatives ?? "Manual spreadsheets and bespoke consulting",
  ).slice(0, 300);
  const businessModelSummary = String(
    allExtracted.businessModel ?? "SaaS tier subscription",
  ).slice(0, 200);

  return {
    question:
      "Thank you! We've captured the essential variables for your research brief. You can review the draft brief preview and finalize it to launch the research run.",
    extracted: newlyExtracted,
    isComplete: true,
    draftBrief: {
      problem: problemSummary,
      customer: customerSummary,
      geography: geography.length > 0 ? geography : ["UAE", "India"],
      category: "Software & AI Solutions",
      alternatives: alternativesSummary,
      businessModel: businessModelSummary,
      differentiation:
        "AI-native automated workflow with evidence verification",
      knownEvidence: [
        {
          statement: `Founder input on ${ideaTitle}`,
          source: "adaptive_interview",
        },
      ],
      unknowns: [
        "Willingness to pay validation among target ICP",
        "Competitor pricing and margin profile",
      ],
      researchQuestions: [
        {
          question: `What is the validated TAM/SAM for ${ideaTitle} in ${geography.join(", ") || "target markets"}?`,
          priority: "high",
        },
        {
          question: "Who are the direct and indirect market competitors?",
          priority: "high",
        },
        {
          question: "What are the common regulatory or compliance constraints?",
          priority: "medium",
        },
      ],
    },
  };
}
