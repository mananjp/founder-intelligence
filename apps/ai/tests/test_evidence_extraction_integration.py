"""PostgreSQL integration tests for evidence extraction and the verbatim gate.

Requires a disposable real PostgreSQL 16 database with pgvector (see
``db/runbooks/db-persistence-tests.md`` and ``conftest.py``). Tests are
skipped when ``TEST_DATABASE_URL`` is unset; they are never run against
``metadata.create_all()`` -- the schema comes from ``db/migrations/*.sql``.
"""

from datetime import date
from decimal import Decimal

import pytest
from pydantic import TypeAdapter

from fi_ai.db.repositories import PostgresRepository
from fi_ai.evidence.extract import (
    ExtractionError,
    extract_from_snapshot,
    insert_verified_evidence,
)
from fi_ai.evidence.schemas import ExtractedEvidence
from fi_ai.evidence.verbatim import VerbatimRejectionError
from fi_ai.llm.fake import FakeLLM
from fi_ai.llm.router import reset_completion_backend, set_completion_backend

OUTPUT_ADAPTER = TypeAdapter(list[ExtractedEvidence])

SNAPSHOT = (
    "Acme launched its new platform in 2024. The platform is designed for "
    "small businesses. Revenue reached $10 million in 2025."
)


def _extraction_output(items):
    return OUTPUT_ADAPTER.validate_python(items)


@pytest.fixture
async def repo(db_engine):
    """Repository bound to the session's migrated test database."""
    return PostgresRepository(db_engine)


async def _run_extract(repo, run_id, source_id, items, snapshot=SNAPSHOT, embed_fn=None):
    evidence_items = _extraction_output(items)
    fake = FakeLLM().enqueue_json({"evidence": [item.model_dump() for item in evidence_items]})
    set_completion_backend(fake)
    try:
        return await extract_from_snapshot(
            run_id=run_id,
            source_id=source_id,
            snapshot_text=snapshot,
            repo=repo,
            embed_fn=embed_fn,
        )
    finally:
        reset_completion_backend()


# --- valid evidence persists ---------------------------------------------


@pytest.mark.integration
async def test_valid_evidence_persists_and_round_trips(repo, seed):
    source = await repo.upsert_source(
        url="https://example.com/acme",
        content_hash="acme-hash",
        source_type="official_site",
        title="Acme platform launch",
        snapshot_uri="memory://snapshots/acme/acme-hash.txt",
    )
    result = await _run_extract(
        repo,
        seed.run_id,
        source.id,
        [
            {
                "claim_text": "Acme launched its new platform in 2024.",
                "quote": "Acme launched its new platform in 2024.",
                "stance": "supports",
                "relevance": 0.9,
                "kind": "fact",
                "value": 10.0,
                "unit": "USD millions",
                "entity": "Acme",
                "observed_at": "2025-12-31",
            }
        ],
        embed_fn=lambda text: [0.125] * 1536,
    )

    assert result.accepted_count == 1
    assert result.evaluated == 1
    assert result.verbatim_rate == 1.0
    assert result.rejected_count == 0

    record = await repo.get_evidence(result.accepted[0].id)
    assert record is not None
    assert record.claim_text == "Acme launched its new platform in 2024."
    assert record.quote == "Acme launched its new platform in 2024."
    assert record.source_id == source.id
    assert record.run_id == seed.run_id
    assert record.value == Decimal("10.0")
    assert record.unit == "USD millions"
    assert record.entity == "Acme"
    assert record.observed_at == date(2025, 12, 31)
    assert record.stance == "supports"
    assert record.relevance == Decimal("0.90")
    assert record.kind == "fact"
    # Embedding round-trip: stored vector comes back unchanged.
    assert record.embedding == [0.125] * 1536
    assert record.created_at is not None


# --- invalid evidence never persists -------------------------------------


@pytest.mark.integration
async def test_invalid_evidence_never_persists(repo, seed):
    source = await repo.upsert_source(
        url="https://example.com/acme",
        content_hash="acme-hash-2",
        source_type="official_site",
    )

    result = await _run_extract(
        repo,
        seed.run_id,
        source.id,
        [
            {
                "claim_text": "The platform serves small businesses.",
                "quote": "Small businesses rely on the platform.",
                "stance": "supports",
            }
        ],
    )

    assert result.accepted_count == 0
    assert result.rejected_count == 1
    assert result.evaluated == 1
    assert result.verbatim_rate == 0.0
    assert await repo.list_evidence_for_run(seed.run_id) == []


@pytest.mark.integration
async def test_invalid_quotes_in_batch_do_not_persist_accepted_either_on_failure(repo, seed):
    """A failed batch leaves no partial writes: accepted evidence of a failed
    batch is rolled back together with everything else."""
    source = await repo.upsert_source(
        url="https://example.com/acme",
        content_hash="acme-hash-3",
        source_type="official_site",
    )

    # The second accepted item's embedding provider fails -> nothing is
    # persisted, including the first accepted item (atomic batch).
    calls = {"n": 0}

    def flaky_embed(text):
        calls["n"] += 1
        if calls["n"] > 1:
            raise RuntimeError("embedding provider down")
        return [0.5] * 1536

    with pytest.raises(ExtractionError, match="embedding generation failed"):
        await _run_extract(
            repo,
            seed.run_id,
            source.id,
            [
                {
                    "claim_text": "Acme launched its new platform in 2024.",
                    "quote": "Acme launched its new platform in 2024.",
                    "stance": "supports",
                },
                {
                    "claim_text": "Revenue reached $10 million in 2025.",
                    "quote": "Revenue reached $10 million in 2025.",
                    "stance": "supports",
                },
            ],
            embed_fn=flaky_embed,
        )

    assert await repo.list_evidence_for_run(seed.run_id) == []


@pytest.mark.integration
async def test_persistence_boundary_rejects_invalid_quote(repo, seed):
    """Direct invocation of the verified persistence path cannot bypass the
    gate: an invalid quote is rejected before any write."""
    source = await repo.upsert_source(
        url="https://example.com/acme",
        content_hash="acme-hash-4",
        source_type="official_site",
    )

    with pytest.raises(VerbatimRejectionError):
        await insert_verified_evidence(
            repo,
            run_id=seed.run_id,
            source_id=source.id,
            snapshot_text=SNAPSHOT,
            claim_text="whatever",
            quote="fabricated wording not in snapshot",
        )

    assert await repo.list_evidence_for_run(seed.run_id) == []


@pytest.mark.integration
async def test_persistence_boundary_persists_valid_quote(repo, seed):
    source = await repo.upsert_source(
        url="https://example.com/acme",
        content_hash="acme-hash-5",
        source_type="official_site",
    )

    record = await insert_verified_evidence(
        repo,
        run_id=seed.run_id,
        source_id=source.id,
        snapshot_text=SNAPSHOT,
        claim_text="Revenue reached $10 million in 2025.",
        quote="Revenue reached $10 million in 2025.",
        stance="supports",
        relevance=Decimal("0.8"),
        embedding=[0.25] * 1536,
    )

    assert record.quote == "Revenue reached $10 million in 2025."
    fetched = await repo.get_evidence(record.id)
    assert fetched is not None
    assert fetched.embedding == [0.25] * 1536


@pytest.mark.integration
async def test_embedding_provider_failure_is_handled_without_partial_writes(
    repo, seed,
):
    source = await repo.upsert_source(
        url="https://example.com/acme",
        content_hash="acme-hash-6",
        source_type="official_site",
    )

    def failing_embed(text):
        raise RuntimeError("embedding provider unavailable")

    with pytest.raises(ExtractionError, match="embedding generation failed"):
        await _run_extract(
            repo,
            seed.run_id,
            source.id,
            [
                {
                    "claim_text": "Acme launched its new platform in 2024.",
                    "quote": "Acme launched its new platform in 2024.",
                    "stance": "supports",
                }
            ],
            embed_fn=failing_embed,
        )

    assert await repo.list_evidence_for_run(seed.run_id) == []
