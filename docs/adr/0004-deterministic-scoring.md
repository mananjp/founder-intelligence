# ADR-0004: Scoring is deterministic code, not LLM output
- Status: proposed
## Decision
LLMs propose dimension ratings *with linked claims*; `packages/scoring` computes score, evidence coverage and confidence. Scoring model is versioned and stored with each score.
