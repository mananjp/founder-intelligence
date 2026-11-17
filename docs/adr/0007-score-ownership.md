# ADR-0007: Score Ownership — AI proposes, Node computes and persists

- Status: accepted
- Date: 2026-11-02
- Deciders: Shreeji Sojitra (AI / Reasoning), Avi Patel (Feature Pod A)
- Last updated: 2026-11-07 (T14 audit fixes — idea_id source, claim-ID validation, persistence)

## Context

The platform has two backend runtimes that share one Postgres database
(ADR-0002).  After a research run completes, an opportunity score must be
computed from per-dimension ratings and persisted to `opportunity_scores`.

Two forces pull in opposite directions:

1. **The LLM work lives in Python.** The `recommend` pipeline stage (Python /
   Celery) is the only component that has already synthesised all the evidence
   claims and can propose per-dimension ratings with cited claim IDs.

2. **The scoring math lives in TypeScript.** `packages/scoring` contains the
   deterministic `computeOpportunityScore()` function — the single source of
   truth for the weighted mean formula, evidence-coverage weighting, and
   `SCORING_MODEL_VERSION` (ADR-0004).  Duplicating this logic in Python
   would create two implementations that can drift apart.

A clean ownership boundary is required so that the final `opportunity_scores`
row is always produced by the same deterministic function (`computeOpportunityScore`)
regardless of which run triggered it.

## Decision

### AI `recommend` stage (Python) — what it owns

- Calls `complete_structured("recommend", ...)` via the T11 LLM router.
- The LLM proposes a `ScoreProposal`: a list of `DimensionProposal` objects,
  each with `key`, `score` (0–10), `evidenceCoverage` (0–1), and
  `citedClaimIds` drawn exclusively from claims verified to exist in the DB
  for this run (see claim-ID validation constraint below).
- The stage validates the proposal (score ranges, non-empty cited claims,
  quality gate) and persists it as an `insights` row with
  `module = "score_proposal"` and `summary = <JSON-serialised proposal>`.
- **The Python AI service MUST NOT write to `opportunity_scores` directly.**

### Node scorecard module (TypeScript, Feature Pod A) — what it owns

- Reads the latest `score_proposal` insight for the run.
- Deserialises the JSON proposal into `DimensionInput[]`.
- Calls `computeOpportunityScore()` from `packages/scoring`.
- Writes the resulting `OpportunityScore` to `opportunity_scores`.

This respects the principle from ADR-0004: *LLMs propose; deterministic code
computes*.  It also keeps `packages/scoring` as the single authoritative
implementation of the formula — no Python port, no duplication.

## Constraints enforced in code

### 1. idea_id must come from the actual research run record

`_persist_score_proposal` requires a genuine `idea_id` — the UUID of the row
in the `ideas` table that this run belongs to.  The `insights` table has a
`NOT NULL FOREIGN KEY` constraint on `idea_id` referencing `ideas(id)`.

**`ctx.run_id` MUST NOT be substituted as `idea_id`.**  A run UUID does not
exist in `ideas`; using it would cause a foreign-key integrity error at
runtime.

`ctx.idea_id` is populated by T15 (AI repository layer) when the run record is
loaded from `research_runs`.  Until T15 is implemented, `ctx.idea_id` is
`None`.  When it is `None` the stage publishes `idea_id_unavailable` and skips
DB persistence entirely — it does not fabricate a substitute value.

### 2. Claim-ID validation is fail-closed

`citedClaimIds` in every `DimensionProposal` must contain only UUIDs that
actually exist in the `claims` table for this run.  The quality gate enforces
this by comparing against `known_claim_ids` — a set loaded from the DB.

**`known_claim_ids` MUST NOT be set to `set(all_cited)`** (the LLM's own
output).  Doing so would trivially whitelist any fabricated UUID the LLM
produces, making the gate a no-op.

Until T15 loads real claim UUIDs from the DB, `known_claim_ids` is an empty
`set()`.  This means the gate rejects all LLM-proposed IDs until real IDs are
available — intentionally fail-closed rather than fail-open.

**T15 integration point:** replace `known_claim_ids: set[str] = set()` in
`recommend.run()` with the result of the T15 repository call that loads claim
IDs for `ctx.run_id`.

### 3. Persistence is blocking, not fire-and-forget

`_persist_score_proposal` calls `asyncio.run(_write_insight(...))` and waits
for the database to confirm the INSERT before returning.  It does not use
`loop.create_task()` or any other fire-and-forget mechanism.

`run()` publishes `score_proposal_persisted` **only after**
`_persist_score_proposal` returns successfully.  If `_persist_score_proposal`
raises, the exception propagates to the orchestrator, which marks the run
`FAILED`.  A lost `score_proposal` insight is not silently acceptable — the
Node scorecard module depends on it.

## Consequences

**Positive:**
- `computeOpportunityScore` remains the single implementation of score maths.
- The AI service never needs to import or replicate TypeScript scoring logic.
- The `insights` table already supports `module = "score_proposal"` as a
  first-class row type — no migration required.
- The Node scorecard module can be implemented and tested independently of the
  research pipeline timing.
- Fail-closed claim-ID validation prevents fabricated evidence from reaching
  the score.

**Negative / trade-offs:**
- There is a two-step async gap between `score_proposal` being written and
  `opportunity_scores` being computed: the Node scorecard module must read the
  insight and call the API after the run completes.  During this window the
  final score is not yet available.  Acceptable for MVP.
- Until T15 loads real claim IDs, the quality gate rejects every LLM proposal
  (known set is empty), so no `score_proposal` rows will be written in
  integration until T15 is complete.  This is correct behaviour — it is better
  to skip the insight than to persist one backed by unverifiable claim IDs.
- Until T15 loads `idea_id` from the run record, the stage exits early and does
  not call the LLM at all.

## T15 integration checklist

When T15 (AI repository layer, `Jiyabhaviksadaria`) is implemented, the
following changes are required in `recommend.py` before `score_proposal` rows
will be written to the DB:

- [ ] Load the run record from `research_runs` and set `ctx.idea_id` to
      `research_runs.idea_id`.
- [ ] Load claim IDs for the run: `SELECT id FROM claims WHERE run_id = :run_id`
      and replace `known_claim_ids: set[str] = set()` with the result.
- [ ] Load a real idea summary and claims list for the LLM prompt (replace
      the stub strings in `run()`).

None of these changes modify the ownership boundary defined in this ADR.

## Alternatives considered

**1. Python computes the score directly**
Rejected.  Would require porting `computeOpportunityScore` to Python or
calling the Node service over HTTP, both of which create synchronisation risk
between two implementations of the same formula.

**2. LLM writes the final score directly**
Rejected.  Violates ADR-0004.  LLM numerical output is non-deterministic and
cannot be versioned as a formula.

**3. A dedicated scoring microservice**
Rejected as over-engineering for MVP.  Adds a third runtime with its own
deploy, healthcheck, and operational burden.

**4. Fire-and-forget DB persistence for score_proposal**
Rejected after T14 audit.  Unlike LLM call tracking (`llm_calls`), the
`score_proposal` insight is user-visible data that the Node scorecard module
depends on.  A silently dropped write would leave the run permanently without
a score.  Blocking persistence is mandatory.
