import { describe, it, expect } from "vitest";
import { computeOpportunityScore } from "../src/opportunityScore.js";

describe("computeOpportunityScore", () => {
  it("weights by evidence coverage, not just raw score", () => {
    const highConfidence = computeOpportunityScore([
      {
        key: "problem_severity",
        score: 9,
        evidenceCoverage: 0.1,
        citedClaimIds: [],
      },
    ]);
    const wellEvidenced = computeOpportunityScore([
      {
        key: "problem_severity",
        score: 6,
        evidenceCoverage: 0.9,
        citedClaimIds: [],
      },
    ]);
    expect(highConfidence.evidenceCoverage).toBeLessThan(
      wellEvidenced.evidenceCoverage,
    );
  });

  it("throws on empty input", () => {
    expect(() => computeOpportunityScore([])).toThrow();
  });

  it("applies explicit weights and rounds the weighted score and coverage", () => {
    expect(
      computeOpportunityScore([
        {
          key: "problem_severity",
          score: 8,
          evidenceCoverage: 0.33333,
          citedClaimIds: [],
          weight: 3,
        },
        {
          key: "market_size",
          score: 5,
          evidenceCoverage: 0.8,
          citedClaimIds: [],
          weight: 1,
        },
      ]),
    ).toMatchObject({ overallScore: 7.3, evidenceCoverage: 0.45 });
  });

  it.each([-1, 11])("rejects a score outside the 0-10 range: %s", (score) => {
    expect(() =>
      computeOpportunityScore([
        {
          key: "problem_severity",
          score,
          evidenceCoverage: 1,
          citedClaimIds: [],
        },
      ]),
    ).toThrow("score out of range");
  });
});
