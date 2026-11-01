from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

import pytest

from fi_ai.db.records import EvidenceRecord
from fi_ai.evidence.schemas import ExtractedEvidence
from fi_ai.research.pipeline.extract import (
    ExtractionCandidate,
    extract_valid_evidence,
    parse_extracted_evidence,
    persist_valid_evidence,
)


def make_evidence(claim_text: str, quote: str) -> ExtractedEvidence:
    return ExtractedEvidence(claim_text=claim_text, quote=quote)


def make_candidate(
    claim_text: str, quote: str, snapshot: str, source_id: UUID | None = None
) -> ExtractionCandidate:
    return ExtractionCandidate(
        evidence=make_evidence(claim_text, quote), source_id=source_id, snapshot=snapshot
    )


def make_evidence_record(**overrides: Any) -> EvidenceRecord:
    values: dict[str, Any] = {
        "id": uuid4(),
        "run_id": uuid4(),
        "source_id": uuid4(),
        "claim_text": "The market is growing",
        "quote": "The market grew 20% year over year.",
        "value": None,
        "unit": None,
        "entity": None,
        "observed_at": None,
        "stance": "supports",
        "relevance": Decimal("0.70"),
        "kind": "fact",
        "embedding": None,
        "created_at": datetime.now(UTC),
    }
    values.update(overrides)
    return EvidenceRecord(**values)


class FakeRepository:
    """Minimal stand-in for ``ResearchRepository`` recording evidence inserts."""

    def __init__(self) -> None:
        self.inserted: list[dict[str, Any]] = []

    async def insert_evidence(self, **kwargs: Any) -> EvidenceRecord:
        self.inserted.append(kwargs)
        return make_evidence_record(
            run_id=kwargs["run_id"],
            source_id=kwargs["source_id"],
            claim_text=kwargs["claim_text"],
            quote=kwargs["quote"],
        )


async def test_valid_candidate_is_persisted_with_embedding(monkeypatch):
    repo = FakeRepository()
    monkeypatch.setattr("fi_ai.research.pipeline.extract.embed_quote", lambda quote: [0.1] * 1536)
    candidate = make_candidate(
        "The market grew 20 percent.",
        "The market grew 20% year over year.",
        "The market grew 20% year over year.",
        source_id=uuid4(),
    )

    persisted, rejected = await persist_valid_evidence(repo, run_id=uuid4(), candidates=[candidate])

    assert rejected == []
    assert len(persisted) == 1
    assert repo.inserted[0]["source_id"] == candidate.source_id
    assert repo.inserted[0]["quote"] == candidate.evidence.quote
    assert repo.inserted[0]["embedding"] == [0.1] * 1536


async def test_invalid_candidate_is_discarded_and_never_persisted_or_embedded(monkeypatch):
    repo = FakeRepository()
    monkeypatch.setattr(
        "fi_ai.research.pipeline.extract.embed_quote",
        lambda quote: pytest.fail("invalid quotes must never be embedded"),
    )
    candidate = make_candidate(
        "The market grew a lot.",
        "The market grew significantly last year.",  # paraphrased -> invalid
        "The market grew 20% year over year.",
        source_id=uuid4(),
    )

    persisted, rejected = await persist_valid_evidence(repo, run_id=uuid4(), candidates=[candidate])

    assert persisted == []
    assert len(rejected) == 1
    assert repo.inserted == []


async def test_missing_source_reference_is_discarded_safely():
    repo = FakeRepository()
    candidate = make_candidate(
        "The market grew 20 percent.",
        "The market grew 20% year over year.",
        "The market grew 20% year over year.",
        source_id=None,
    )

    persisted, rejected = await persist_valid_evidence(repo, run_id=uuid4(), candidates=[candidate])

    assert persisted == []
    assert len(rejected) == 1
    assert repo.inserted == []


async def test_empty_candidate_set_persists_nothing():
    repo = FakeRepository()

    persisted, rejected = await persist_valid_evidence(repo, run_id=uuid4(), candidates=[])

    assert persisted == []
    assert rejected == []
    assert repo.inserted == []


async def test_extract_valid_evidence_keeps_source_association_of_valid_candidates():
    candidate = make_candidate(
        "The market grew 20 percent.",
        "The market grew 20% year over year.",
        "The market grew 20% year over year.",
        source_id=uuid4(),
    )

    valid, rejected = extract_valid_evidence([candidate])

    assert rejected == []
    assert len(valid) == 1
    assert valid[0].source_id == candidate.source_id
    assert valid[0].evidence.claim_text == candidate.evidence.claim_text
    assert valid[0].snapshot == candidate.snapshot


# --- malformed model output ------------------------------------------------------


def test_parse_extracted_evidence_accepts_valid_mapping():
    parsed = parse_extracted_evidence(
        {"claim_text": "The market grew 20 percent.", "quote": "The market grew 20% year over year."}
    )

    assert parsed is not None
    assert parsed.quote == "The market grew 20% year over year."


def test_parse_extracted_evidence_accepts_valid_json_string():
    parsed = parse_extracted_evidence(
        '{"claim_text": "The market grew 20 percent.", "quote": "The market grew 20% year over year."}'
    )

    assert parsed is not None
    assert parsed.claim_text == "The market grew 20 percent."


def test_parse_extracted_evidence_passes_through_instances():
    evidence = make_evidence("The market grew 20 percent.", "The market grew 20% year over year.")

    assert parse_extracted_evidence(evidence) is evidence


def test_parse_extracted_evidence_rejects_malformed_output_safely():
    assert parse_extracted_evidence(None) is None
    assert parse_extracted_evidence(42) is None
    assert parse_extracted_evidence(["not", "a", "mapping"]) is None
    assert parse_extracted_evidence("{not valid json") is None
    assert parse_extracted_evidence('["still not a mapping"]') is None
    assert parse_extracted_evidence({"quote": "too short"}) is None
    assert parse_extracted_evidence({"claim_text": "missing quote field entirely"}) is None


# --- observability of validation failures ----------------------------------------


def test_rejected_quotes_are_logged_observably():
    from structlog.testing import capture_logs

    invalid = make_candidate(
        "The market grew a lot.",
        "The market grew significantly last year.",  # paraphrased -> invalid
        "The market grew 20% year over year.",
        source_id=uuid4(),
    )
    missing_source = make_candidate(
        "The market grew 20 percent.",
        "The market grew 20% year over year.",
        "The market grew 20% year over year.",
        source_id=None,
    )

    with capture_logs() as captured:
        valid, rejected = extract_valid_evidence([invalid, missing_source])

    assert valid == []
    assert len(rejected) == 2

    rejection_events = [entry for entry in captured if entry["event"] == "extract.quote_rejected"]
    assert len(rejection_events) == 2
    assert any(
        "quote is not a verbatim substring of the source snapshot" in entry["reasons"]
        for entry in rejection_events
    )
    assert any("missing source reference" in entry["reasons"] for entry in rejection_events)


# --- real PostgreSQL persistence --------------------------------------------------


@pytest.mark.integration
async def test_persist_valid_evidence_against_postgres(monkeypatch, db_engine, seed):
    from fi_ai.db.repositories import PostgresRepository

    monkeypatch.setattr(
        "fi_ai.research.pipeline.extract.embed_quote",
        lambda quote: [0.1] * 1536,
    )
    repo = PostgresRepository(db_engine)
    source = await repo.upsert_source(
        url="https://example.com/market-report",
        content_hash="hash-verbatim-integration",
        source_type="news",
    )
    snapshot = "The market grew 20% year over year. Analysts expect continued growth."
    valid = make_candidate(
        "The market grew 20 percent.",
        "The market grew 20% year over year.",
        snapshot,
        source_id=source.id,
    )
    invalid = make_candidate(
        "The market grew a lot.",
        "The market grew significantly last year.",  # paraphrased -> invalid
        snapshot,
        source_id=source.id,
    )

    persisted, rejected = await persist_valid_evidence(repo, run_id=seed.run_id, candidates=[valid, invalid])

    # Valid evidence is persisted with its embedding and source association intact.
    assert len(persisted) == 1
    assert rejected == [invalid]
    stored = await repo.get_evidence(persisted[0].id)
    assert stored is not None
    assert stored.run_id == seed.run_id
    assert stored.source_id == source.id
    assert stored.quote == valid.evidence.quote  # original quote text preserved verbatim
    assert stored.embedding is not None
    assert len(stored.embedding) == 1536
    assert stored.embedding[0] == pytest.approx(0.1)

    # Invalid evidence was discarded before persistence: no row, no embedding.
    rows = await repo.list_evidence_for_run(seed.run_id)
    assert [row.quote for row in rows] == [valid.evidence.quote]
