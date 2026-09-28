import { describe, expect, it } from "vitest";
import { rankExperiments } from "../src/experimentPriority.js";

describe("rankExperiments", () => {
  it("ranks experiments by expected learning and decision impact per cost", () => {
    expect(
      rankExperiments([
        { id: "cheap", expectedLearning: 0.8, decisionImpact: 0.8, costTime: 1 },
        { id: "expensive", expectedLearning: 1, decisionImpact: 1, costTime: 4 },
      ]).map(({ id }) => id),
    ).toEqual(["cheap", "expensive"]);
  });

  it("clamps near-zero costs and rounds priority scores to three decimals", () => {
    expect(
      rankExperiments([
        { id: "zero-cost", expectedLearning: 0.1234, decisionImpact: 0.4567, costTime: 0 },
      ]),
    ).toEqual([
      {
        id: "zero-cost",
        expectedLearning: 0.1234,
        decisionImpact: 0.4567,
        costTime: 0,
        priorityScore: 5.636,
      },
    ]);
  });
});
