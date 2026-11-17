"""Stage: recommend

Generates a score_proposal insight for the run.

ADR-0007 (score ownership): this stage proposes per-dimension ratings with
cited claim IDs and persists them as an insights row (module='score_proposal').
The final opportunity_scores row is written by the Node scorecard module
(Feature Pod A) after calling computeOpportunityScore() from packages/scoring.

This stage MUST NOT write to opportunity_scores directly.

T15 dependency note
-------------------
Two inputs are stubs until T15 (AI repository layer) is implemented:

1. ``ctx.idea_id`` — must be the UUID of the idea row in the database (from
   the research_runs record).  Until T15 populates RunContext.idea_id the
   stage will skip DB persistence and publish ``idea_id_unavailable``.  It
   MUST NOT substitute ctx.run_id as a placeholder.

2. Known claim IDs — the quality gate validates that every UUID proposed by
   the LLM actually exists in the claims table for this run.  Until T15 loads
   real claim IDs the known set is empty, so the gate rejects all LLM-proposed
   IDs.  This is intentionally fail-closed: a proposal with unverifiable IDs
   is not persisted.

Owner: AI / Reasoning squad (S2-14, shreejisojitra).
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Annotated

from pydantic import BaseModel, Field, field_validator

from fi_ai.evidence.quality_gate import check_recommendation
from fi_ai.llm.router import MissingApiKeyError, ProviderError, ValidationRetryExhausted, complete_structured
from fi_ai.research.orchestrator import RunContext

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Valid dimension keys (mirrors DimensionKey in packages/contracts/src/opportunity.ts)
# ---------------------------------------------------------------------------

DIMENSION_KEYS: frozenset[str] = frozenset(
    [
        "problem_severity",
        "market_attractiveness",
        "customer_willingness",
        "competitive_pressure",
        "differentiation",
        "timing",
        "monetization",
        "distribution_feasibility",
        "defensibility",
        "execution_fit",
    ]
)

# ---------------------------------------------------------------------------
# Pydantic schemas for the LLM-generated score proposal
# ---------------------------------------------------------------------------


class DimensionProposal(BaseModel):
    """A single per-dimension rating proposed by the LLM.

    All values are LLM proposals — the final score is computed deterministically
    by computeOpportunityScore() in Node (ADR-0007).
    """

    key: str
    score: Annotated[float, Field(ge=0, le=10)]
    evidenceCoverage: Annotated[float, Field(ge=0, le=1)]
    citedClaimIds: list[str] = Field(default_factory=list)

    @field_validator("key")
    @classmethod
    def key_must_be_valid(cls, v: str) -> str:
        if v not in DIMENSION_KEYS:
            raise ValueError(f"unknown dimension key '{v}'; must be one of {sorted(DIMENSION_KEYS)}")
        return v

    @field_validator("citedClaimIds")
    @classmethod
    def cited_claims_must_be_non_empty(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("citedClaimIds must contain at least one claim ID")
        return v


class ScoreProposal(BaseModel):
    """The full score proposal returned by the LLM for one research run."""

    dimensions: list[DimensionProposal] = Field(min_length=1)
    rationale: str = Field(min_length=10)


# ---------------------------------------------------------------------------
# DB insert — blocking (not fire-and-forget)
# ---------------------------------------------------------------------------
# Fix 3 (audit): persistence must complete before the stage reports success.
# run() is always invoked synchronously from a Celery worker (no running event
# loop), so asyncio.run() executes the coroutine to completion in-place.
# We do NOT use loop.create_task() because that would return before the INSERT
# commits, allowing the stage to publish score_proposal_persisted before the
# row is actually in the database.
# ---------------------------------------------------------------------------

_INSERT_INSIGHT_SQL = """
INSERT INTO insights (idea_id, run_id, module, summary, cited_claim_ids)
VALUES (:idea_id, :run_id, :module, :summary, :cited_claim_ids)
ON CONFLICT DO NOTHING
"""


def _persist_score_proposal(
    *,
    idea_id: str,
    run_id: str,
    proposal: ScoreProposal,
) -> None:
    """Blocking: write a score_proposal insights row and wait for the DB to confirm.

    Raises on DB failure — the caller (run()) catches this and must NOT publish
    score_proposal_persisted if this function raises.
    """
    asyncio.run(_write_insight(idea_id=idea_id, run_id=run_id, proposal=proposal))


async def _write_insight(*, idea_id: str, run_id: str, proposal: ScoreProposal) -> None:
    """Execute the INSERT.  Raises on any DB-level exception (no swallowing)."""
    from sqlalchemy import text

    from fi_ai.db import engine  # late import — keeps module importable without DB

    all_cited: list[str] = []
    for dim in proposal.dimensions:
        all_cited.extend(dim.citedClaimIds)
    unique_cited = sorted(set(all_cited))

    summary_json = json.dumps(
        {
            "dimensions": [
                {
                    "key": d.key,
                    "score": d.score,
                    "evidenceCoverage": d.evidenceCoverage,
                    "citedClaimIds": d.citedClaimIds,
                }
                for d in proposal.dimensions
            ],
            "rationale": proposal.rationale,
        }
    )

    async with engine.begin() as conn:
        await conn.execute(
            text(_INSERT_INSIGHT_SQL),
            {
                "idea_id": idea_id,
                "run_id": run_id,
                "module": "score_proposal",
                "summary": summary_json,
                "cited_claim_ids": unique_cited,
            },
        )
    log.info(
        "recommend: persisted score_proposal insight run_id=%s dimensions=%d",
        run_id,
        len(proposal.dimensions),
    )


# ---------------------------------------------------------------------------
# Message builder
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are generating a structured opportunity score proposal for a startup idea
based on completed market research.

Rules:
- Rate ONLY dimensions for which the research surfaced evidence-backed claims.
- For each dimension, set score (0-10), evidenceCoverage (0-1), and list the
  actual claim UUIDs from the research run in citedClaimIds.
- citedClaimIds MUST NOT be empty — every dimension needs at least one cited claim.
- Do NOT invent claim IDs. Only use IDs that appear in the provided claims list.
- Include a rationale string (≥10 chars) summarising the overall scoring rationale.
- Return ONLY valid JSON matching the ScoreProposal schema. No markdown fences.

Valid dimension keys: problem_severity, market_attractiveness, customer_willingness,
competitive_pressure, differentiation, timing, monetization, distribution_feasibility,
defensibility, execution_fit

Response format:
{
  "dimensions": [
    {
      "key": "<dimension_key>",
      "score": <0-10>,
      "evidenceCoverage": <0.0-1.0>,
      "citedClaimIds": ["<uuid>", ...]
    }
  ],
  "rationale": "<overall scoring rationale>"
}
"""


def _build_messages(run_id: str, idea_summary: str, claims_summary: str) -> list[dict]:
    user_content = (
        f"Research run: {run_id}\n\n"
        f"Idea summary:\n{idea_summary}\n\n"
        f"Available claims (use these IDs in citedClaimIds):\n{claims_summary}"
    )
    return [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]


# ---------------------------------------------------------------------------
# Stage entry point
# ---------------------------------------------------------------------------


def run(ctx: RunContext) -> None:
    """Recommend stage: produce a score_proposal insight via the LLM router.

    ADR-0007: writes to insights (module='score_proposal') only.
    Does NOT write to opportunity_scores — that is the Node scorecard module's job.

    Requires ctx.idea_id (populated by T15).  If it is None the stage skips
    DB persistence rather than substituting ctx.run_id.
    """
    ctx.publish({"type": "stage.progress", "stage": "recommend", "note": "generating score_proposal"})

    # ------------------------------------------------------------------
    # Fix 1 (audit): idea_id guard.
    # ctx.idea_id is populated by T15 when the run record is loaded from DB.
    # Using run_id as a substitute would write a row with a foreign-key value
    # that does not exist in the ideas table, causing an integrity error.
    # We skip persistence and report the gap clearly rather than fabricating data.
    # ------------------------------------------------------------------
    if ctx.idea_id is None:
        log.warning("recommend: ctx.idea_id is None (T15 pending) — score_proposal will not be persisted")
        ctx.publish({"type": "stage.progress", "stage": "recommend", "note": "idea_id_unavailable"})
        return

    # TODO(T15/T13): load real idea summary and claim list from DB once the
    # repository layer (T15) and synthesize stage (T13) are implemented.
    idea_summary = f"Research run {ctx.run_id} — idea details not yet loaded (T15 pending)."
    claims_summary = "No claims loaded yet (T15 pending). Do not fabricate claim IDs."

    messages = _build_messages(ctx.run_id, idea_summary, claims_summary)

    try:
        proposal: ScoreProposal = complete_structured(
            "recommend",
            messages,
            ScoreProposal,
            run_id=ctx.run_id,
        )
    except (ProviderError, ValidationRetryExhausted, MissingApiKeyError) as exc:
        log.warning("recommend: LLM failed — score_proposal not generated: %s", exc)
        ctx.publish({"type": "stage.progress", "stage": "recommend", "note": "llm_failed"})
        return

    # ------------------------------------------------------------------
    # Fix 2 (audit): quality gate must be fail-closed.
    # known_claim_ids is intentionally empty until T15 loads the real claim
    # UUIDs for this run from the database.  This means ANY LLM-proposed UUID
    # will be treated as unknown and the gate will reject the proposal.
    # We do NOT pass set(all_cited) — that would trivially whitelist fabricated IDs.
    # ------------------------------------------------------------------
    all_cited = [cid for dim in proposal.dimensions for cid in dim.citedClaimIds]
    known_claim_ids: set[str] = set()  # T15: replace with real DB claim IDs for this run
    gate = check_recommendation(
        cited_claim_ids=all_cited,
        known_claim_ids=known_claim_ids,
        has_unknowns_section=bool(proposal.rationale),
    )
    if not gate.passed:
        log.warning("recommend: quality gate failed — %s", gate.reasons)
        ctx.publish({"type": "stage.progress", "stage": "recommend", "note": "quality_gate_failed"})
        return

    # ------------------------------------------------------------------
    # Fix 3 (audit): only publish success AFTER the DB confirms the insert.
    # _persist_score_proposal now raises on DB failure instead of swallowing it.
    # A raised exception here propagates to the orchestrator which marks the
    # run as FAILED — this is correct; a lost score_proposal must not be silent.
    # ------------------------------------------------------------------
    _persist_score_proposal(
        idea_id=ctx.idea_id,
        run_id=ctx.run_id,
        proposal=proposal,
    )

    ctx.publish({"type": "stage.progress", "stage": "recommend", "note": "score_proposal_persisted"})
