import type { DimensionKey } from "@fi/contracts";

export const SCORING_MODEL_VERSION = "opportunity-score.v1";

/**
 * Deterministic opportunity score (Bible §19, ADR-0004).
 * LLMs may PROPOSE a 0-10 rating per dimension with cited claims; this function only aggregates.
 * Overall score = evidence-coverage-weighted mean, so a confidently-guessed 9/10 with no evidence
 * cannot outrank a well-evidenced 6/10 by much — coverage is multiplied in, not just displayed beside it.
 */
export interface DimensionInput {
  key: DimensionKey;
  score: number;          // 0-10, from the LLM synthesis step
  evidenceCoverage: number; // 0-1, fraction of sub-claims for this dimension that are evidence-backed
  citedClaimIds: string[];
  weight?: number;         // default 1; product/PM may tune per-dimension weight later
}

export function computeOpportunityScore(dims: DimensionInput[]) {
  if (dims.length === 0) throw new Error("no dimensions supplied");
  let weightedScoreSum = 0;
  let weightedCoverageSum = 0;
  let weightSum = 0;
  for (const d of dims) {
    if (d.score < 0 || d.score > 10) throw new Error(`score out of range for ${d.key}`);
    const w = d.weight ?? 1;
    weightedScoreSum += d.score * w;
    weightedCoverageSum += d.evidenceCoverage * w;
    weightSum += w;
  }
  const overallScore = round1(weightedScoreSum / weightSum);
  const evidenceCoverage = round3(weightedCoverageSum / weightSum);
  return { overallScore, evidenceCoverage, scoringModelVersion: SCORING_MODEL_VERSION };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
