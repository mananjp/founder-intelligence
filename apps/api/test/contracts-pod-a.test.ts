import { describe, it, expect } from "vitest";
import {
  OpportunityScore,
  Assumption,
  Experiment,
  Recommendation,
  Decision,
} from "@fi/contracts";

describe("Pod A Contract Tests — Decision & Opportunity Layer", () => {
  it("validates OpportunityScore contract schema", () => {
    const validScore = {
      ideaId: "11111111-1111-4111-8111-111111111111",
      overallScore: 8.5,
      evidenceCoverage: 0.75,
      dimensions: {
        problem_severity: {
          score: 9.0,
          evidenceCoverage: 0.8,
          citedClaimIds: ["22222222-2222-4222-8222-222222222222"],
        },
      },
      scoringModelVersion: "v1.0.0",
    };

    const parsed = OpportunityScore.parse(validScore);
    expect(parsed.overallScore).toBe(8.5);
    expect(parsed.dimensions.problem_severity.score).toBe(9.0);
  });

  it("validates Assumption contract schema", () => {
    const validAssumption = {
      id: "33333333-3333-4333-8333-333333333333",
      ideaId: "11111111-1111-4111-8111-111111111111",
      type: "customer",
      statement: "Founders spend at least 10 hours a week researching competitors manually.",
      importance: "high",
      status: "testing",
      linkedClaimIds: ["22222222-2222-4222-8222-222222222222"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = Assumption.parse(validAssumption);
    expect(parsed.type).toBe("customer");
    expect(parsed.importance).toBe("high");
  });

  it("validates Experiment contract schema", () => {
    const validExperiment = {
      id: "44444444-4444-4444-8444-444444444444",
      ideaId: "11111111-1111-4111-8111-111111111111",
      assumptionId: "33333333-3333-4333-8333-333333333333",
      method: "interviews",
      hypothesis: "At least 7 of 10 interviewed founders validate painful manual diligence.",
      expectedLearning: 0.85,
      decisionImpact: 0.9,
      costTime: 12.0,
      priorityScore: 0.063,
      status: "proposed",
      createdAt: new Date().toISOString(),
    };

    const parsed = Experiment.parse(validExperiment);
    expect(parsed.method).toBe("interviews");
    expect(parsed.status).toBe("proposed");
  });

  it("validates Recommendation and Decision contract schemas", () => {
    const validRecommendation = {
      id: "55555555-5555-4555-8555-555555555555",
      ideaId: "11111111-1111-4111-8111-111111111111",
      action: "Double down on ICP: early-stage devtool founders",
      rationale: "Strongest willingness to pay identified in pricing survey.",
      citedClaimIds: ["22222222-2222-4222-8222-222222222222"],
      linkedAssumptionIds: ["33333333-3333-4333-8333-333333333333"],
      confidence: 0.92,
      createdAt: new Date().toISOString(),
    };

    const rec = Recommendation.parse(validRecommendation);
    expect(rec.confidence).toBe(0.92);

    const validDecision = {
      id: "66666666-6666-4666-8666-666666666666",
      ideaId: "11111111-1111-4111-8111-111111111111",
      recommendationId: rec.id,
      choice: "Pivot messaging toward devtool vertical",
      decidedBy: "77777777-7777-4777-8777-777777777777",
      linkedAssumptionIds: [validRecommendation.linkedAssumptionIds[0]],
      citedClaimIds: [validRecommendation.citedClaimIds[0]],
      createdAt: new Date().toISOString(),
    };

    const dec = Decision.parse(validDecision);
    expect(dec.choice).toContain("Pivot");
  });
});
