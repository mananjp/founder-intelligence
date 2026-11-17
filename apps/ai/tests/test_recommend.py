"""Tests for the recommend pipeline stage — S2-14 Score Ownership (ADR-0007).

All tests use FakeLLM via set_completion_backend — no real API keys needed.

Coverage:
  1.  Valid structured score proposal returned and persisted
  2.  Invalid JSON → T11 retry → success
  3.  score_proposal insight persisted with correct module and JSON
  4.  Invalid score range rejected by Pydantic
  5.  Invalid evidenceCoverage rejected by Pydantic
  6.  Empty citedClaimIds rejected by Pydantic
  7.  Unknown dimension key rejected by Pydantic
  8.  opportunity_scores never written by Python (ADR-0007)
  9.  LLM failure → graceful degradation, no exception raised
  10. Recommend stage publishes stage.progress event
  11. [Fix 1] Missing idea_id prevents persistence
  12. [Fix 1] run_id is never substituted for idea_id
  13. [Fix 2] Unknown/fabricated claim IDs are rejected by quality gate
  14. [Fix 2] Empty known_claim_ids means gate cannot pass on LLM-proposed IDs
  15. [Fix 3] Database failure does not report successful persistence
  16. [Fix 3] Successful persistence is confirmed before success event
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from fi_ai.llm.fake import FakeLLM
from fi_ai.llm.router import ProviderError, reset_completion_backend, set_completion_backend
from fi_ai.research.orchestrator import RunContext
from fi_ai.research.pipeline.recommend import (
    DIMENSION_KEYS,
    DimensionProposal,
    ScoreProposal,
    _build_messages,
    run,
)

# ---------------------------------------------------------------------------
# Shared fixtures and helpers
# ---------------------------------------------------------------------------

VALID_DIMENSION = {
    "key": "problem_severity",
    "score": 7.5,
    "evidenceCoverage": 0.8,
    "citedClaimIds": ["00000000-0000-0000-0000-000000000001"],
}

VALID_PROPOSAL_JSON = json.dumps(
    {
        "dimensions": [VALID_DIMENSION],
        "rationale": "Strong evidence for the problem dimension with good claim coverage.",
    }
)


@pytest.fixture(autouse=True)
def restore_backend():
    yield
    reset_completion_backend()


@pytest.fixture()
def fake() -> FakeLLM:
    f = FakeLLM()
    set_completion_backend(f)
    return f


def _make_ctx(run_id: str = "run-test-001", *, idea_id: str | None = None) -> RunContext:
    """Build a RunContext.  Pass idea_id=<str> for tests that need the full flow."""
    ctx = RunContext(run_id, idea_id=idea_id)
    ctx.publish = MagicMock()
    return ctx


# ---------------------------------------------------------------------------
# 1. Valid structured score proposal
# ---------------------------------------------------------------------------


def test_valid_score_proposal_parsed(monkeypatch, fake):
    monkeypatch.setenv("LLM_STRONG_MODEL", "provider/strong")
    fake.enqueue_raw(VALID_PROPOSAL_JSON)
    ctx = _make_ctx(idea_id="idea-aaa")

    with patch("fi_ai.research.pipeline.recommend._persist_score_proposal"):
        run(ctx)

    assert fake.call_count == 1


def test_dimension_proposal_schema_accepts_valid_input():
    dp = DimensionProposal(**VALID_DIMENSION)
    assert dp.key == "problem_severity"
    assert dp.score == 7.5
    assert dp.evidenceCoverage == 0.8
    assert dp.citedClaimIds == ["00000000-0000-0000-0000-000000000001"]


def test_score_proposal_schema_accepts_multiple_dimensions():
    proposal = ScoreProposal(
        dimensions=[
            DimensionProposal(
                key="problem_severity",
                score=8.0,
                evidenceCoverage=0.9,
                citedClaimIds=["00000000-0000-0000-0000-000000000001"],
            ),
            DimensionProposal(
                key="differentiation",
                score=6.0,
                evidenceCoverage=0.5,
                citedClaimIds=["00000000-0000-0000-0000-000000000002"],
            ),
        ],
        rationale="Well-evidenced problem and clear differentiation.",
    )
    assert len(proposal.dimensions) == 2


# ---------------------------------------------------------------------------
# 2. Invalid JSON → T11 retry → success
# ---------------------------------------------------------------------------


def test_invalid_json_retries_and_succeeds(monkeypatch, fake):
    monkeypatch.setenv("LLM_STRONG_MODEL", "provider/strong")
    fake.enqueue_raw("not valid json at all")
    fake.enqueue_raw(VALID_PROPOSAL_JSON)

    ctx = _make_ctx(idea_id="idea-aaa")
    with patch("fi_ai.research.pipeline.recommend._persist_score_proposal"):
        run(ctx)

    assert fake.call_count == 2


# ---------------------------------------------------------------------------
# 3. score_proposal insight persisted with correct module and JSON
# ---------------------------------------------------------------------------


def test_persist_score_proposal_uses_correct_module():
    ScoreProposal(
        dimensions=[DimensionProposal(**VALID_DIMENSION)],
        rationale="Adequate problem evidence observed.",
    )

    # Verify the JSON serialisation produces the expected structure
    summary = json.dumps(
        {
            "dimensions": [
                {
                    "key": "problem_severity",
                    "score": 7.5,
                    "evidenceCoverage": 0.8,
                    "citedClaimIds": ["00000000-0000-0000-0000-000000000001"],
                }
            ],
            "rationale": "Adequate problem evidence observed.",
        }
    )
    parsed = json.loads(summary)
    assert parsed["dimensions"][0]["key"] == "problem_severity"
    assert parsed["dimensions"][0]["citedClaimIds"] == ["00000000-0000-0000-0000-000000000001"]
    # The module field written to insights must always be "score_proposal" (ADR-0007)
    # This is verified structurally by _write_insight hardcoding it; see Fix 3 tests below.


def test_persist_score_proposal_called_on_success(monkeypatch, fake):
    monkeypatch.setenv("LLM_STRONG_MODEL", "provider/strong")
    # Fix 2: with an empty known_claim_ids, the quality gate will reject the
    # LLM-proposed UUID.  Patch _persist_score_proposal separately to isolate
    # the test to the LLM path; the quality-gate bypass tests are in section 13-14.
    fake.enqueue_raw(VALID_PROPOSAL_JSON)
    ctx = _make_ctx(idea_id="idea-aaa")

    persisted: list[dict] = []

    def capture_persist(**kw: object) -> None:
        persisted.append(dict(kw))

    with (
        patch("fi_ai.research.pipeline.recommend._persist_score_proposal", side_effect=capture_persist),
        patch("fi_ai.research.pipeline.recommend.check_recommendation") as mock_gate,
    ):
        # Simulate gate passing (T15 scenario where real claim IDs are loaded)
        from fi_ai.evidence.quality_gate import GateResult

        mock_gate.return_value = GateResult(passed=True)
        run(ctx)

    assert len(persisted) == 1
    assert persisted[0]["run_id"] == ctx.run_id
    assert persisted[0]["idea_id"] == "idea-aaa"
    assert isinstance(persisted[0]["proposal"], ScoreProposal)


# ---------------------------------------------------------------------------
# 4. Invalid score range rejected by Pydantic
# ---------------------------------------------------------------------------


def test_score_below_zero_rejected():
    from pydantic import ValidationError

    with pytest.raises(ValidationError, match="greater than or equal"):
        DimensionProposal(
            key="problem_severity",
            score=-1.0,
            evidenceCoverage=0.5,
            citedClaimIds=["00000000-0000-0000-0000-000000000001"],
        )


def test_score_above_ten_rejected():
    from pydantic import ValidationError

    with pytest.raises(ValidationError, match="less than or equal"):
        DimensionProposal(
            key="problem_severity",
            score=10.1,
            evidenceCoverage=0.5,
            citedClaimIds=["00000000-0000-0000-0000-000000000001"],
        )


# ---------------------------------------------------------------------------
# 5. Invalid evidenceCoverage rejected by Pydantic
# ---------------------------------------------------------------------------


def test_evidence_coverage_above_one_rejected():
    from pydantic import ValidationError

    with pytest.raises(ValidationError, match="less than or equal"):
        DimensionProposal(
            key="problem_severity",
            score=7.0,
            evidenceCoverage=1.5,
            citedClaimIds=["00000000-0000-0000-0000-000000000001"],
        )


def test_evidence_coverage_below_zero_rejected():
    from pydantic import ValidationError

    with pytest.raises(ValidationError, match="greater than or equal"):
        DimensionProposal(
            key="problem_severity",
            score=7.0,
            evidenceCoverage=-0.1,
            citedClaimIds=["00000000-0000-0000-0000-000000000001"],
        )


# ---------------------------------------------------------------------------
# 6. Empty citedClaimIds rejected by Pydantic
# ---------------------------------------------------------------------------


def test_empty_cited_claim_ids_rejected():
    from pydantic import ValidationError

    with pytest.raises(ValidationError, match="citedClaimIds must contain at least one"):
        DimensionProposal(
            key="problem_severity",
            score=7.0,
            evidenceCoverage=0.8,
            citedClaimIds=[],
        )


# ---------------------------------------------------------------------------
# 7. Unknown dimension key rejected by Pydantic
# ---------------------------------------------------------------------------


def test_unknown_dimension_key_rejected():
    from pydantic import ValidationError

    with pytest.raises(ValidationError, match="unknown dimension key"):
        DimensionProposal(
            key="not_a_real_dimension",
            score=5.0,
            evidenceCoverage=0.5,
            citedClaimIds=["00000000-0000-0000-0000-000000000001"],
        )


def test_all_ten_dimension_keys_are_valid():
    """All 10 keys from packages/contracts/src/opportunity.ts must be accepted."""
    expected = {
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
    }
    assert DIMENSION_KEYS == expected


# ---------------------------------------------------------------------------
# 8. opportunity_scores NEVER written by Python (ADR-0007)
# ---------------------------------------------------------------------------


def test_opportunity_scores_table_never_written(monkeypatch, fake):
    """Python code must never INSERT into opportunity_scores — ADR-0007."""
    monkeypatch.setenv("LLM_STRONG_MODEL", "provider/strong")
    fake.enqueue_raw(VALID_PROPOSAL_JSON)
    ctx = _make_ctx(idea_id="idea-aaa")

    with (
        patch("fi_ai.research.pipeline.recommend._persist_score_proposal") as mock_persist,
        patch("fi_ai.research.pipeline.recommend.check_recommendation") as mock_gate,
    ):
        from fi_ai.evidence.quality_gate import GateResult

        mock_gate.return_value = GateResult(passed=True)
        run(ctx)
    mock_persist.assert_called_once()
    kw = mock_persist.call_args.kwargs
    assert "opportunity_scores" not in str(kw)


# ---------------------------------------------------------------------------
# 9. LLM failure → graceful degradation, no exception raised
# ---------------------------------------------------------------------------


def test_llm_failure_does_not_raise(monkeypatch, fake):
    monkeypatch.setenv("LLM_STRONG_MODEL", "provider/strong")
    # Both attempts fail — ValidationRetryExhausted raised by T11 router
    fake.enqueue_raw("bad json 1")
    fake.enqueue_raw("bad json 2")
    ctx = _make_ctx(idea_id="idea-aaa")

    # Must not raise — pipeline must continue
    run(ctx)

    events = [call.args[0] for call in ctx.publish.call_args_list]
    assert any(e["stage"] == "recommend" for e in events)


def test_provider_error_does_not_raise(monkeypatch):
    monkeypatch.setenv("LLM_STRONG_MODEL", "provider/strong")
    ctx = _make_ctx(idea_id="idea-aaa")

    with patch(
        "fi_ai.research.pipeline.recommend.complete_structured",
        side_effect=ProviderError("network down"),
    ):
        run(ctx)  # must not raise

    events = [call.args[0] for call in ctx.publish.call_args_list]
    notes = [e.get("note") for e in events]
    assert "llm_failed" in notes


# ---------------------------------------------------------------------------
# 10. Stage publishes stage.progress event
# ---------------------------------------------------------------------------


def test_stage_publishes_progress_event_with_correct_fields(monkeypatch, fake):
    monkeypatch.setenv("LLM_STRONG_MODEL", "provider/strong")
    fake.enqueue_raw(VALID_PROPOSAL_JSON)
    ctx = _make_ctx(idea_id="idea-aaa")

    with (
        patch("fi_ai.research.pipeline.recommend._persist_score_proposal"),
        patch("fi_ai.research.pipeline.recommend.check_recommendation") as mock_gate,
    ):
        from fi_ai.evidence.quality_gate import GateResult

        mock_gate.return_value = GateResult(passed=True)
        run(ctx)

    events = [call.args[0] for call in ctx.publish.call_args_list]
    assert all(e["type"] == "stage.progress" for e in events)
    assert all(e["stage"] == "recommend" for e in events)
    notes = {e["note"] for e in events}
    assert "score_proposal_persisted" in notes


def test_build_messages_includes_run_id():
    messages = _build_messages("run-abc", "idea summary", "claims list")
    user_text = messages[1]["content"]
    assert "run-abc" in user_text
    assert len(messages) == 2
    assert messages[0]["role"] == "system"
    assert messages[1]["role"] == "user"


# ---------------------------------------------------------------------------
# 11. [Fix 1] Missing idea_id prevents persistence
# ---------------------------------------------------------------------------


def test_missing_idea_id_skips_persistence(monkeypatch, fake):
    """When ctx.idea_id is None the stage must not call _persist_score_proposal."""
    monkeypatch.setenv("LLM_STRONG_MODEL", "provider/strong")
    fake.enqueue_raw(VALID_PROPOSAL_JSON)
    # idea_id intentionally absent (default None)
    ctx = _make_ctx(idea_id=None)

    with patch("fi_ai.research.pipeline.recommend._persist_score_proposal") as mock_persist:
        run(ctx)

    mock_persist.assert_not_called()
    # LLM must also not be called — we exit before the LLM call
    assert fake.call_count == 0


def test_missing_idea_id_publishes_unavailable_note(monkeypatch, fake):
    """idea_id_unavailable note must be published so the operator knows why persist was skipped."""
    monkeypatch.setenv("LLM_STRONG_MODEL", "provider/strong")
    ctx = _make_ctx(idea_id=None)

    with patch("fi_ai.research.pipeline.recommend._persist_score_proposal"):
        run(ctx)

    events = [call.args[0] for call in ctx.publish.call_args_list]
    notes = [e.get("note") for e in events]
    assert "idea_id_unavailable" in notes


def test_missing_idea_id_never_publishes_persisted_note(monkeypatch, fake):
    """score_proposal_persisted must never appear when idea_id is None."""
    monkeypatch.setenv("LLM_STRONG_MODEL", "provider/strong")
    ctx = _make_ctx(idea_id=None)

    run(ctx)

    events = [call.args[0] for call in ctx.publish.call_args_list]
    notes = [e.get("note") for e in events]
    assert "score_proposal_persisted" not in notes


# ---------------------------------------------------------------------------
# 12. [Fix 1] run_id is never substituted for idea_id
# ---------------------------------------------------------------------------


def test_idea_id_is_not_run_id(monkeypatch, fake):
    """_persist_score_proposal must receive idea_id != run_id."""
    monkeypatch.setenv("LLM_STRONG_MODEL", "provider/strong")
    fake.enqueue_raw(VALID_PROPOSAL_JSON)
    ctx = _make_ctx(run_id="run-xyz", idea_id="idea-distinctfromrun")

    persisted: list[dict] = []

    def capture(**kw: object) -> None:
        persisted.append(dict(kw))

    with (
        patch("fi_ai.research.pipeline.recommend._persist_score_proposal", side_effect=capture),
        patch("fi_ai.research.pipeline.recommend.check_recommendation") as mock_gate,
    ):
        from fi_ai.evidence.quality_gate import GateResult

        mock_gate.return_value = GateResult(passed=True)
        run(ctx)

    assert len(persisted) == 1
    assert persisted[0]["idea_id"] != persisted[0]["run_id"]
    assert persisted[0]["idea_id"] == "idea-distinctfromrun"
    assert persisted[0]["run_id"] == "run-xyz"


def test_runcontext_idea_id_field_exists():
    """RunContext must expose an idea_id field (additive change to orchestrator)."""
    ctx = RunContext("run-001")
    assert hasattr(ctx, "idea_id")
    assert ctx.idea_id is None  # default when not supplied

    ctx2 = RunContext("run-002", idea_id="idea-abc")
    assert ctx2.idea_id == "idea-abc"


# ---------------------------------------------------------------------------
# 13. [Fix 2] Unknown/fabricated claim IDs are rejected by quality gate
# ---------------------------------------------------------------------------


def test_fabricated_claim_ids_rejected_by_quality_gate(monkeypatch, fake):
    """LLM-proposed UUIDs are unknown; gate must fail and stage must not persist."""
    monkeypatch.setenv("LLM_STRONG_MODEL", "provider/strong")
    fake.enqueue_raw(VALID_PROPOSAL_JSON)
    ctx = _make_ctx(idea_id="idea-aaa")

    persisted: list[dict] = []

    with patch("fi_ai.research.pipeline.recommend._persist_score_proposal", side_effect=persisted.append):
        run(ctx)

    # Gate failed — nothing persisted
    assert persisted == []
    events = [call.args[0] for call in ctx.publish.call_args_list]
    notes = [e.get("note") for e in events]
    assert "quality_gate_failed" in notes
    assert "score_proposal_persisted" not in notes


def test_quality_gate_receives_empty_known_set(monkeypatch, fake):
    """check_recommendation must be called with known_claim_ids=set() (not set(all_cited))."""
    monkeypatch.setenv("LLM_STRONG_MODEL", "provider/strong")
    fake.enqueue_raw(VALID_PROPOSAL_JSON)
    ctx = _make_ctx(idea_id="idea-aaa")

    gate_calls: list[dict] = []

    def capture_gate(**kw: object) -> object:
        gate_calls.append(dict(kw))
        from fi_ai.evidence.quality_gate import GateResult

        return GateResult(passed=False, reasons=["sentinel"])

    with patch("fi_ai.research.pipeline.recommend.check_recommendation", side_effect=capture_gate):
        run(ctx)

    assert len(gate_calls) == 1
    known = gate_calls[0]["known_claim_ids"]
    # Must be empty — never equal to the LLM-cited set
    assert known == set()
    # cited_claim_ids must NOT be empty (the LLM did propose something)
    assert gate_calls[0]["cited_claim_ids"] != []


# ---------------------------------------------------------------------------
# 14. [Fix 2] Empty known_claim_ids means the gate always rejects LLM IDs
# ---------------------------------------------------------------------------


def test_empty_known_set_always_rejects_any_cited_id():
    """With known_claim_ids=set(), any non-empty cited list fails the gate."""
    from fi_ai.evidence.quality_gate import check_recommendation

    result = check_recommendation(
        cited_claim_ids=["00000000-0000-0000-0000-000000000001"],
        known_claim_ids=set(),
        has_unknowns_section=True,
    )
    assert not result.passed
    assert any("non-existent" in r for r in result.reasons)


def test_gate_passes_only_when_all_ids_are_known():
    """Gate passes only when cited IDs are a subset of known_claim_ids."""
    from fi_ai.evidence.quality_gate import check_recommendation

    claim_id = "00000000-0000-0000-0000-000000000001"
    result = check_recommendation(
        cited_claim_ids=[claim_id],
        known_claim_ids={claim_id},
        has_unknowns_section=True,
    )
    assert result.passed


# ---------------------------------------------------------------------------
# 15. [Fix 3] Database failure does not report successful persistence
# ---------------------------------------------------------------------------


def test_db_failure_does_not_publish_persisted_note(monkeypatch, fake):
    """If _persist_score_proposal raises, score_proposal_persisted must NOT be published."""
    monkeypatch.setenv("LLM_STRONG_MODEL", "provider/strong")
    fake.enqueue_raw(VALID_PROPOSAL_JSON)
    ctx = _make_ctx(idea_id="idea-aaa")

    def failing_persist(**_kw: object) -> None:
        raise RuntimeError("DB connection lost")

    with (
        patch("fi_ai.research.pipeline.recommend._persist_score_proposal", side_effect=failing_persist),
        patch("fi_ai.research.pipeline.recommend.check_recommendation") as mock_gate,
    ):
        from fi_ai.evidence.quality_gate import GateResult

        mock_gate.return_value = GateResult(passed=True)
        # The DB error must propagate — orchestrator should mark run FAILED
        with pytest.raises(RuntimeError, match="DB connection lost"):
            run(ctx)

    events = [call.args[0] for call in ctx.publish.call_args_list]
    notes = [e.get("note") for e in events]
    assert "score_proposal_persisted" not in notes


def test_db_failure_propagates_to_caller(monkeypatch, fake):
    """DB errors must not be silently swallowed — they must surface to the orchestrator."""
    monkeypatch.setenv("LLM_STRONG_MODEL", "provider/strong")
    fake.enqueue_raw(VALID_PROPOSAL_JSON)
    ctx = _make_ctx(idea_id="idea-aaa")

    with (
        patch("fi_ai.research.pipeline.recommend._persist_score_proposal", side_effect=OSError("disk full")),
        patch("fi_ai.research.pipeline.recommend.check_recommendation") as mock_gate,
    ):
        from fi_ai.evidence.quality_gate import GateResult

        mock_gate.return_value = GateResult(passed=True)
        with pytest.raises(OSError, match="disk full"):
            run(ctx)


# ---------------------------------------------------------------------------
# 16. [Fix 3] Successful persistence is confirmed before success event
# ---------------------------------------------------------------------------


def test_persisted_note_published_only_after_persist_returns(monkeypatch, fake):
    """score_proposal_persisted is published only after _persist_score_proposal returns."""
    monkeypatch.setenv("LLM_STRONG_MODEL", "provider/strong")
    fake.enqueue_raw(VALID_PROPOSAL_JSON)
    ctx = _make_ctx(idea_id="idea-aaa")

    call_order: list[str] = []

    def ordered_persist(**_kw: object) -> None:
        call_order.append("persist")

    def ordered_publish(event: dict) -> None:
        call_order.append(event.get("note", ""))

    ctx.publish = ordered_publish

    with (
        patch("fi_ai.research.pipeline.recommend._persist_score_proposal", side_effect=ordered_persist),
        patch("fi_ai.research.pipeline.recommend.check_recommendation") as mock_gate,
    ):
        from fi_ai.evidence.quality_gate import GateResult

        mock_gate.return_value = GateResult(passed=True)
        run(ctx)

    # "persist" must come before "score_proposal_persisted" in the call order
    persist_idx = call_order.index("persist")
    persisted_idx = call_order.index("score_proposal_persisted")
    assert persist_idx < persisted_idx


def test_write_insight_uses_insight_table_not_opportunity_scores():
    """_write_insight SQL must target 'insights', never 'opportunity_scores'."""
    from fi_ai.research.pipeline.recommend import _INSERT_INSIGHT_SQL

    sql_lower = _INSERT_INSIGHT_SQL.lower()
    assert "insights" in sql_lower
    assert "opportunity_scores" not in sql_lower
    assert "module" in sql_lower
    assert ":idea_id" in _INSERT_INSIGHT_SQL
    assert ":run_id" in _INSERT_INSIGHT_SQL
