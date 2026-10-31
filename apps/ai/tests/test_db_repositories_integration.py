"""PostgreSQL integration tests for the persistence repositories.

These tests are intentionally marked ``integration`` and only run when
``TEST_DATABASE_URL`` points at a disposable database whose name contains ``test``.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError

from fi_ai.db import tables
from fi_ai.db.protocol import ResearchRepository
from fi_ai.db.repositories import PostgresRepository

pytestmark = pytest.mark.integration


async def _count(engine, table, *where) -> int:
    async with engine.begin() as connection:
        return (
            await connection.execute(sa.select(sa.func.count()).select_from(table).where(*where))
        ).scalar_one()


async def _raw_value(engine, statement):
    async with engine.begin() as connection:
        return (await connection.execute(statement)).scalar_one_or_none()


@pytest.fixture
async def repo(db_engine) -> PostgresRepository:
    repository = PostgresRepository(db_engine)
    assert isinstance(repository, ResearchRepository)
    return repository


async def make_source(repo, **overrides):
    values = {
        "url": f"https://example.com/{uuid4()}",
        "content_hash": f"hash-{uuid4()}",
        "source_type": "news",
    }
    values.update(overrides)
    return await repo.upsert_source(**values)


# --- runs ---------------------------------------------------------------------


async def test_get_run_returns_persisted_fields(repo, seed):
    run = await repo.get_run(seed.run_id)

    assert run is not None
    assert run.id == seed.run_id
    assert run.workspace_id == seed.workspace_id
    assert run.idea_id == seed.idea_id
    assert run.brief_id == seed.brief_id
    assert run.depth == "quick"
    assert run.geography == ["AE"]
    assert run.state == "created"
    assert run.spent_usd == Decimal("0.00")
    assert run.completed_at is None


async def test_get_run_missing_returns_none(repo):
    assert await repo.get_run(uuid4()) is None


async def test_update_run_progress_updates_state_spend_and_completion(repo, seed):
    completed_at = datetime(2026, 10, 31, 12, 0, tzinfo=UTC)

    updated = await repo.update_run_progress(
        seed.run_id,
        state="fetching",
        spent_usd=Decimal("0.42"),
        completed_at=completed_at,
    )

    assert updated is not None
    assert updated.state == "fetching"
    assert updated.spent_usd == Decimal("0.42")
    assert updated.completed_at == completed_at
    assert await repo.get_run(seed.run_id) == updated


async def test_update_run_progress_missing_record_returns_none(repo):
    assert await repo.update_run_progress(uuid4(), state="failed") is None


async def test_update_run_progress_requires_a_field(repo, seed):
    with pytest.raises(ValueError, match="at least one field"):
        await repo.update_run_progress(seed.run_id)


async def test_add_run_cost_is_atomic_and_missing_record_returns_none(repo, seed):
    first = await repo.add_run_cost(seed.run_id, Decimal("0.25"))
    second = await repo.add_run_cost(seed.run_id, 0.5)

    assert first is not None and second is not None
    assert second.spent_usd == Decimal("0.75")
    assert await repo.add_run_cost(uuid4(), 1) is None


# --- briefs -------------------------------------------------------------------


async def test_get_brief_and_latest_brief(repo, db_engine, seed):
    brief = await repo.get_brief(seed.brief_id)
    assert brief is not None
    assert brief.version == 1

    newer_id = uuid4()
    async with db_engine.begin() as connection:
        await connection.execute(
            tables.research_briefs.insert().values(
                id=newer_id,
                idea_id=seed.idea_id,
                version=2,
                problem="Refined problem",
            )
        )

    latest = await repo.get_latest_brief(seed.idea_id)
    assert latest is not None
    assert latest.id == newer_id
    assert latest.version == 2
    assert latest.problem == "Refined problem"

    assert await repo.get_brief(uuid4()) is None
    assert await repo.get_latest_brief(uuid4()) is None


# --- sources: idempotent (url, content_hash) upsert --------------------------


async def test_upsert_source_inserts_new_source(repo):
    source = await repo.upsert_source(
        url="https://example.com/a",
        content_hash="hash-a",
        source_type="government",
        title="Official data",
        publisher="Example",
        published_at=date(2025, 1, 2),
        snapshot_uri="s3://snapshots/a",
    )

    assert source.id is not None
    assert source.url == "https://example.com/a"
    assert source.content_hash == "hash-a"
    assert source.source_type == "government"
    assert source.title == "Official data"
    assert source.snapshot_uri == "s3://snapshots/a"


async def test_upsert_source_repeat_returns_same_row_without_duplicate(repo, db_engine):
    first = await make_source(repo, url="https://example.com/repeat", content_hash="same")
    second = await repo.upsert_source(
        url="https://example.com/repeat",
        content_hash="same",
        source_type="news",
    )

    assert second.id == first.id
    assert await _count(db_engine, tables.sources) == 1


async def test_upsert_source_same_url_different_hash_creates_new_row(repo, db_engine):
    first = await repo.upsert_source(
        url="https://example.com/page", content_hash="version-1", source_type="news"
    )
    second = await repo.upsert_source(
        url="https://example.com/page", content_hash="version-2", source_type="news"
    )

    assert second.id != first.id
    assert await _count(db_engine, tables.sources) == 2


async def test_upsert_source_same_hash_different_url_creates_new_row(repo, db_engine):
    first = await repo.upsert_source(
        url="https://one.example.com/page", content_hash="mirrored", source_type="news"
    )
    second = await repo.upsert_source(
        url="https://two.example.com/page", content_hash="mirrored", source_type="news"
    )

    assert second.id != first.id
    assert await _count(db_engine, tables.sources) == 2


async def test_upsert_source_updates_mutable_fields_and_preserves_identity(repo):
    accessed_at = datetime(2026, 1, 1, 8, 30, tzinfo=UTC)
    first = await repo.upsert_source(
        url="https://example.com/mutable",
        content_hash="hash-mutable",
        source_type="news",
        title="Initial title",
        publisher="Initial publisher",
        accessed_at=accessed_at,
    )

    second = await repo.upsert_source(
        url="https://example.com/mutable",
        content_hash="hash-mutable",
        source_type="government",
        title="Updated title",
        publisher="Updated publisher",
    )

    assert second.id == first.id
    assert second.url == first.url
    assert second.content_hash == first.content_hash
    assert second.accessed_at == accessed_at
    assert second.source_type == "government"
    assert second.title == "Updated title"
    assert second.publisher == "Updated publisher"


async def test_upsert_source_sparse_retry_does_not_erase_known_metadata(repo):
    first = await repo.upsert_source(
        url="https://example.com/sparse",
        content_hash="hash-sparse",
        source_type="news",
        title="Kept title",
        publisher="Kept publisher",
        snapshot_uri="s3://snapshots/kept",
    )

    second = await repo.upsert_source(
        url="https://example.com/sparse",
        content_hash="hash-sparse",
        source_type="news",
    )

    assert second.id == first.id
    assert second.title == "Kept title"
    assert second.publisher == "Kept publisher"
    assert second.snapshot_uri == "s3://snapshots/kept"


async def test_get_source_and_get_source_by_key(repo):
    source = await make_source(repo, url="https://example.com/lookup", content_hash="lookup")

    assert await repo.get_source(source.id) == source
    assert await repo.get_source_by_key(url="https://example.com/lookup", content_hash="lookup") == source
    assert await repo.get_source(uuid4()) is None
    assert await repo.get_source_by_key(url="missing", content_hash="missing") is None


async def test_database_rejects_duplicate_natural_key_when_bypassing_upsert(repo, db_engine):
    await repo.upsert_source(url="https://example.com/unique", content_hash="unique-hash", source_type="news")

    with pytest.raises(IntegrityError):
        async with db_engine.begin() as connection:
            await connection.execute(
                tables.sources.insert().values(
                    url="https://example.com/unique",
                    content_hash="unique-hash",
                    source_type="news",
                )
            )

    assert await _count(db_engine, tables.sources) == 1


async def test_concurrent_source_upserts_create_one_logical_row(repo, db_engine):
    async def upsert():
        return await repo.upsert_source(
            url="https://example.com/concurrent",
            content_hash="concurrent-hash",
            source_type="news",
            title="Concurrent",
        )

    results = await asyncio.gather(*(upsert() for _ in range(8)))

    assert len({source.id for source in results}) == 1
    assert await _count(db_engine, tables.sources) == 1


# --- evidence -----------------------------------------------------------------


async def test_insert_evidence_applies_defaults_and_round_trips_embedding(repo, seed):
    source = await make_source(repo)
    embedding = [0.1] * 1536

    evidence = await repo.insert_evidence(
        run_id=seed.run_id,
        source_id=source.id,
        claim_text="The market is growing",
        quote="The market grew 20% year over year.",
        value=Decimal("20.0"),
        unit="%",
        entity="UAE",
        observed_at=date(2025, 5, 1),
        embedding=embedding,
    )

    assert evidence.stance == "supports"
    assert evidence.kind == "fact"
    assert evidence.relevance == Decimal("0.70")
    assert evidence.value == Decimal("20.0")
    assert evidence.embedding is not None
    assert len(evidence.embedding) == 1536
    assert evidence.embedding[0] == pytest.approx(0.1)
    assert await repo.get_evidence(evidence.id) == evidence


async def test_insert_evidence_is_idempotent_with_deterministic_id(repo, seed):
    source = await make_source(repo)
    evidence_id = uuid4()

    first = await repo.insert_evidence(
        run_id=seed.run_id,
        source_id=source.id,
        claim_text="Original claim",
        quote="Original quote",
        evidence_id=evidence_id,
    )
    second = await repo.insert_evidence(
        run_id=seed.run_id,
        source_id=source.id,
        claim_text="Different claim",
        quote="Different quote",
        evidence_id=evidence_id,
    )

    assert first.id == second.id == evidence_id
    assert second.claim_text == "Original claim"


async def test_list_evidence_for_run_and_missing(repo, seed):
    source = await make_source(repo)
    first = await repo.insert_evidence(
        run_id=seed.run_id, source_id=source.id, claim_text="One", quote="Quote one"
    )
    second = await repo.insert_evidence(
        run_id=seed.run_id, source_id=source.id, claim_text="Two", quote="Quote two"
    )

    evidence = await repo.list_evidence_for_run(seed.run_id)
    assert {item.id for item in evidence} == {first.id, second.id}
    assert await repo.list_evidence_for_run(uuid4()) == []
    assert await repo.get_evidence(uuid4()) is None


async def test_evidence_rejects_invalid_foreign_keys_without_partial_write(repo, seed, db_engine):
    with pytest.raises(IntegrityError):
        await repo.insert_evidence(
            run_id=seed.run_id,
            source_id=uuid4(),
            claim_text="Invalid source",
            quote="Quote",
        )

    with pytest.raises(IntegrityError):
        await repo.insert_evidence(
            run_id=uuid4(),
            source_id=(await make_source(repo)).id,
            claim_text="Invalid run",
            quote="Quote",
        )

    assert await _count(db_engine, tables.evidence) == 0


# --- claims and links ---------------------------------------------------------


async def test_insert_claim_defaults_filters_and_idempotency(repo, seed, db_engine):
    claim_id = uuid4()
    first = await repo.insert_claim(
        idea_id=seed.idea_id,
        run_id=seed.run_id,
        statement="Customers pay monthly",
        module="pricing",
        status="supported",
        claim_id=claim_id,
    )
    second = await repo.insert_claim(
        idea_id=seed.idea_id,
        run_id=seed.run_id,
        statement="This statement must not overwrite the first",
        module="market",
        status="verified",
        claim_id=claim_id,
    )
    await repo.insert_claim(
        idea_id=seed.idea_id,
        statement="A second claim",
        module="market",
        status="directional",
    )

    assert first.id == second.id == claim_id
    assert second.statement == "Customers pay monthly"
    assert first.origin == "evidence"
    assert first.kind == "fact"
    assert await _count(db_engine, tables.claims) == 2

    pricing = await repo.list_claims_for_idea(seed.idea_id, module="pricing")
    assert [claim.id for claim in pricing] == [claim_id]

    directional = await repo.list_claims_for_idea(seed.idea_id, status="directional")
    assert len(directional) == 1
    assert directional[0].module == "market"

    assert await repo.get_claim(claim_id) == first
    assert await repo.get_claim(uuid4()) is None
    assert await repo.list_claims_for_idea(uuid4()) == []


async def test_claim_rejects_invalid_idea(repo, db_engine):
    with pytest.raises(IntegrityError):
        await repo.insert_claim(
            idea_id=uuid4(),
            statement="No idea",
            module="market",
            status="unverified",
        )
    assert await _count(db_engine, tables.claims) == 0


async def _make_claim(repo, seed, **overrides):
    values = {
        "idea_id": seed.idea_id,
        "statement": f"Claim {uuid4()}",
        "module": "market",
        "status": "supported",
    }
    values.update(overrides)
    return await repo.insert_claim(**values)


async def test_claim_evidence_links_are_idempotent(repo, seed, db_engine):
    claim = await _make_claim(repo, seed)
    source = await make_source(repo)
    evidence = await repo.insert_evidence(
        run_id=seed.run_id, source_id=source.id, claim_text="Claim", quote="Quote"
    )

    assert await repo.link_claim_evidence(claim.id, evidence.id) is True
    assert await repo.link_claim_evidence(claim.id, evidence.id) is False
    assert await _count(db_engine, tables.claim_evidence) == 1


async def test_claim_evidence_rejects_invalid_references(repo, seed, db_engine):
    claim = await _make_claim(repo, seed)
    source = await make_source(repo)
    evidence = await repo.insert_evidence(
        run_id=seed.run_id, source_id=source.id, claim_text="Claim", quote="Quote"
    )

    with pytest.raises(IntegrityError):
        await repo.link_claim_evidence(uuid4(), evidence.id)
    with pytest.raises(IntegrityError):
        await repo.link_claim_evidence(claim.id, uuid4())

    assert await _count(db_engine, tables.claim_evidence) == 0


async def test_contradiction_links_are_idempotent_and_keep_first_note(repo, seed, db_engine):
    first = await _make_claim(repo, seed)
    second = await _make_claim(repo, seed)

    assert await repo.link_claim_contradiction(first.id, second.id, note="first note") is True
    assert await repo.link_claim_contradiction(first.id, second.id, note="second note") is False

    note = await _raw_value(
        db_engine,
        sa.select(tables.claim_contradictions.c.note).where(
            tables.claim_contradictions.c.claim_id == first.id
        ),
    )
    assert note == "first note"
    assert await _count(db_engine, tables.claim_contradictions) == 1


async def test_contradiction_rejects_invalid_reference(repo, seed, db_engine):
    claim = await _make_claim(repo, seed)
    with pytest.raises(IntegrityError):
        await repo.link_claim_contradiction(claim.id, uuid4())
    assert await _count(db_engine, tables.claim_contradictions) == 0


# --- insights / recommendations / assumptions --------------------------------


async def test_insights_are_idempotent_and_listed_by_run(repo, seed, db_engine):
    claim = await _make_claim(repo, seed)
    insight_id = uuid4()
    first = await repo.insert_insight(
        idea_id=seed.idea_id,
        run_id=seed.run_id,
        module="market",
        summary="Market is growing",
        cited_claim_ids=[claim.id],
        insight_id=insight_id,
    )
    second = await repo.insert_insight(
        idea_id=seed.idea_id,
        run_id=seed.run_id,
        module="market",
        summary="Must not overwrite",
        cited_claim_ids=[claim.id],
        insight_id=insight_id,
    )

    assert first.id == second.id == insight_id
    assert second.summary == "Market is growing"
    assert first.cited_claim_ids == [claim.id]
    assert [item.id for item in await repo.list_insights_for_run(seed.run_id)] == [insight_id]
    assert await repo.list_insights_for_run(uuid4()) == []
    assert await _count(db_engine, tables.insights) == 1


async def test_insight_rejects_invalid_idea(repo, seed):
    with pytest.raises(IntegrityError):
        await repo.insert_insight(idea_id=uuid4(), module="market", summary="No idea", cited_claim_ids=[])


async def test_recommendations_are_idempotent_and_listed(repo, seed, db_engine):
    claim = await _make_claim(repo, seed)
    recommendation_id = uuid4()
    first = await repo.insert_recommendation(
        idea_id=seed.idea_id,
        run_id=seed.run_id,
        action="Run a pricing test",
        rationale="WTP is unproven",
        cited_claim_ids=[claim.id],
        confidence=Decimal("0.64"),
        recommendation_id=recommendation_id,
    )
    second = await repo.insert_recommendation(
        idea_id=seed.idea_id,
        run_id=seed.run_id,
        action="Must not overwrite",
        rationale="Must not overwrite",
        cited_claim_ids=[],
        recommendation_id=recommendation_id,
    )

    assert first.id == second.id == recommendation_id
    assert second.action == "Run a pricing test"
    assert second.cited_claim_ids == [claim.id]
    assert second.confidence == Decimal("0.64")
    assert [item.id for item in await repo.list_recommendations_for_idea(seed.idea_id)] == [recommendation_id]
    assert await repo.list_recommendations_for_idea(uuid4()) == []
    assert await _count(db_engine, tables.recommendations) == 1


async def test_recommendation_rejects_invalid_idea(repo):
    with pytest.raises(IntegrityError):
        await repo.insert_recommendation(
            idea_id=uuid4(),
            action="No idea",
            rationale="Invalid",
            cited_claim_ids=[],
        )


async def test_assumptions_defaults_and_idempotency(repo, seed, db_engine):
    claim = await _make_claim(repo, seed)
    assumption_id = uuid4()
    first = await repo.insert_assumption(
        idea_id=seed.idea_id,
        type="wtp",
        statement="Customers will pay $49/month",
        linked_claim_ids=[claim.id],
        assumption_id=assumption_id,
    )
    second = await repo.insert_assumption(
        idea_id=seed.idea_id,
        type="wtp",
        statement="Must not overwrite",
        assumption_id=assumption_id,
    )

    assert first.id == second.id == assumption_id
    assert second.statement == "Customers will pay $49/month"
    assert first.importance == "medium"
    assert first.status == "unverified"
    assert first.linked_claim_ids == [claim.id]
    assert await _count(db_engine, tables.assumptions) == 1


async def test_assumption_rejects_invalid_idea(repo):
    with pytest.raises(IntegrityError):
        await repo.insert_assumption(idea_id=uuid4(), type="problem", statement="Invalid")


# --- scores / llm calls -------------------------------------------------------


async def test_opportunity_scores_are_idempotent_and_latest_wins(repo, seed, db_engine):
    score_id = uuid4()
    first = await repo.insert_opportunity_score(
        idea_id=seed.idea_id,
        run_id=seed.run_id,
        dimension_scores={"problem_severity": {"score": 8, "citations": []}},
        overall_score=Decimal("7.8"),
        evidence_coverage=Decimal("0.62"),
        scoring_model_version="score-v1",
        score_id=score_id,
    )
    second = await repo.insert_opportunity_score(
        idea_id=seed.idea_id,
        dimension_scores={"problem_severity": {"score": 1}},
        overall_score=Decimal("1.0"),
        evidence_coverage=Decimal("0.1"),
        scoring_model_version="score-v1",
        score_id=score_id,
    )

    assert first.id == second.id == score_id
    assert second.overall_score == Decimal("7.8")
    assert second.evidence_coverage == Decimal("0.620")
    assert await repo.get_latest_opportunity_score(seed.idea_id) == first
    assert await repo.get_latest_opportunity_score(uuid4()) is None
    assert await _count(db_engine, tables.opportunity_scores) == 1


async def test_opportunity_score_rejects_invalid_idea(repo):
    with pytest.raises(IntegrityError):
        await repo.insert_opportunity_score(
            idea_id=uuid4(),
            dimension_scores={},
            overall_score=1,
            evidence_coverage=0,
            scoring_model_version="score-v1",
        )


async def test_llm_calls_are_recorded_and_summed_per_run(repo, seed, db_engine):
    first = await repo.insert_llm_call(
        task="extract",
        model="fast",
        run_id=seed.run_id,
        input_tokens=100,
        output_tokens=50,
        cost_usd=Decimal("0.0123"),
        latency_ms=420,
    )
    second = await repo.insert_llm_call(
        task="synthesize",
        model="strong",
        run_id=seed.run_id,
        cost_usd=Decimal("0.5"),
        status="error",
    )

    assert first.status == "ok"
    assert first.id < second.id
    assert await repo.get_run_cost(seed.run_id) == Decimal("0.5123")
    assert await repo.get_run_cost(uuid4()) == Decimal(0)
    assert await _count(db_engine, tables.llm_calls) == 2


async def test_llm_call_run_id_is_set_null_when_run_is_deleted(repo, seed, db_engine):
    call = await repo.insert_llm_call(task="extract", model="fast", run_id=seed.run_id, cost_usd=1)

    async with db_engine.begin() as connection:
        await connection.execute(
            sa.delete(tables.research_runs).where(tables.research_runs.c.id == seed.run_id)
        )

    run_id = await _raw_value(
        db_engine, sa.select(tables.llm_calls.c.run_id).where(tables.llm_calls.c.id == call.id)
    )
    assert run_id is None


async def test_llm_call_rejects_invalid_run(repo):
    with pytest.raises(IntegrityError):
        await repo.insert_llm_call(task="extract", model="fast", run_id=uuid4())


# --- transactions and cleanup -------------------------------------------------


async def test_transaction_commits_all_writes(repo, db_engine, seed):
    source = await make_source(repo)
    claim = await _make_claim(repo, seed)
    evidence = await repo.insert_evidence(
        run_id=seed.run_id, source_id=source.id, claim_text="Claim", quote="Quote"
    )

    async with repo.transaction() as tx:
        await tx.link_claim_evidence(claim.id, evidence.id)
        await tx.insert_llm_call(task="transaction", model="fast", run_id=seed.run_id, cost_usd=1)

    assert await _count(db_engine, tables.claim_evidence) == 1
    assert await _count(db_engine, tables.llm_calls) == 1


async def test_failed_transaction_rolls_back_every_write(repo, db_engine, seed):
    source = await make_source(repo)

    with pytest.raises(RuntimeError, match="boom"):
        async with repo.transaction() as tx:
            await tx.upsert_source(
                url="https://example.com/rollback",
                content_hash="rollback",
                source_type="news",
            )
            await tx.insert_llm_call(task="rollback", model="fast", run_id=seed.run_id)
            raise RuntimeError("boom")

    assert await _count(db_engine, tables.sources, tables.sources.c.url == source.url) == 1
    assert await _count(db_engine, tables.sources) == 1
    assert await _count(db_engine, tables.llm_calls) == 0


async def test_failed_statement_does_not_leave_partial_write(repo, db_engine, seed):
    source = await make_source(repo)

    with pytest.raises(IntegrityError):
        await repo.insert_evidence(
            run_id=uuid4(),
            source_id=source.id,
            claim_text="Invalid run",
            quote="Quote",
        )

    assert await _count(db_engine, tables.evidence) == 0


async def test_operations_release_connections(db_engine, seed):
    from sqlalchemy.ext.asyncio import create_async_engine

    local_engine = create_async_engine(db_engine.url, pool_size=2)
    local_repo = PostgresRepository(local_engine)
    try:
        await local_repo.get_run(seed.run_id)
        await make_source(local_repo)
        assert local_engine.pool.checkedout() == 0
    finally:
        await local_engine.dispose()


async def test_repeated_reads_are_isolated_between_tests(repo, seed):
    """The autouse fixture truncates tables; this test sees only its own seed rows."""
    assert await _count_via_repo_claims(repo, seed) == 0


async def _count_via_repo_claims(repo, seed) -> int:
    return len(await repo.list_claims_for_idea(seed.idea_id))
