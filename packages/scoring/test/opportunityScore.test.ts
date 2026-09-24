import { describe, it, expect } from "vitest";
import { computeOpportunityScore } from "../src/opportunityScore.js";

describe("computeOpportunityScore", () => {
  it("weights by evidence coverage, not just raw score", () => {
    const highConfidence = computeOpportunityScore([
      { key: "problem_severity", score: 9, evidenceCoverage: 0.1, citedClaimIds: [] },
    ]);
    const wellEvidenced = computeOpportunityScore([
      { key: "problem_severity", score: 6, evidenceCoverage: 0.9, citedClaimIds: [] },
    ]);
    expect(highConfidence.evidenceCoverage).toBeLessThan(wellEvidenced.evidenceCoverage);
  });

  it("throws on empty input", () => {
    expect(() => computeOpportunityScore([])).toThrow();
  });
});
