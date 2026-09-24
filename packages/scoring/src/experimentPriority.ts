/**
 * Experiment ranking (Bible §21): expected_learning * decision_impact / cost_time.
 * All three inputs are 0-1 normalized except cost_time, which is relative effort (person-days or $ , consistent unit).
 */
export interface ExperimentInput {
  id: string;
  expectedLearning: number;  // 0-1
  decisionImpact: number;    // 0-1
  costTime: number;          // > 0
}

export function rankExperiments(inputs: ExperimentInput[]) {
  return inputs
    .map((e) => ({ ...e, priorityScore: round3((e.expectedLearning * e.decisionImpact) / Math.max(e.costTime, 0.01)) }))
    .sort((a, b) => b.priorityScore - a.priorityScore);
}
const round3 = (n: number) => Math.round(n * 1000) / 1000;
