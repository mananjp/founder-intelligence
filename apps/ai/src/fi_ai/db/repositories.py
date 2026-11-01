"""SQLAlchemy Core persistence repositories.

Transactions are explicit and scoped to the operation (or to ``transaction()`` when a
caller needs several statements to commit atomically). Database errors are never
swallowed; they propagate after SQLAlchemy has rolled the failed transaction back.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Mapping, Sequence
from contextlib import asynccontextmanager
from datetime import date, datetime
from decimal import Decimal
from typing import Any, TypeVar
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine
from sqlalchemy.sql import Executable

from fi_ai.db import tables
from fi_ai.db.records import (
    AssumptionRecord,
    ClaimRecord,
    EvidenceRecord,
    InsightRecord,
    LlmCallRecord,
    OpportunityScoreRecord,
    RecommendationRecord,
    ResearchBriefRecord,
    ResearchRunRecord,
    SourceRecord,
)

RecordT = TypeVar("RecordT")


class PostgresRepository:
    """Async repository backed by an ``AsyncEngine``.

    Pass ``connection`` only when the caller already owns a transaction. Without it each
    operation opens ``engine.begin()`` so a successful statement commits and a failing
    one rolls back.
    """

    def __init__(
        self,
        engine: AsyncEngine,
        connection: AsyncConnection | None = None,
    ) -> None:
        self._engine = engine
        self._connection = connection

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[PostgresRepository]:
        """Group several repository calls into one atomic unit."""
        if self._connection is not None:
            async with self._connection.begin_nested():
                yield self
            return
        async with self._engine.begin() as connection:
            yield PostgresRepository(self._engine, connection)

    # --- statement helpers ----------------------------------------------------

    async def _fetchone(self, statement: Executable) -> sa.Row[Any] | None:
        if self._connection is not None:
            return (await self._connection.execute(statement)).first()
        async with self._engine.begin() as connection:
            return (await connection.execute(statement)).first()

    async def _fetchall(self, statement: Executable) -> list[sa.Row[Any]]:
        if self._connection is not None:
            return list((await self._connection.execute(statement)).all())
        async with self._engine.begin() as connection:
            return list((await connection.execute(statement)).all())

    async def _rowcount(self, statement: Executable) -> int:
        if self._connection is not None:
            return (await self._connection.execute(statement)).rowcount
        async with self._engine.begin() as connection:
            return (await connection.execute(statement)).rowcount

    async def _insert_idempotent(
        self,
        statement: Executable,
        table: sa.Table,
        id_value: UUID,
    ) -> sa.Row[Any]:
        """Insert with ``ON CONFLICT (id) DO NOTHING`` and return the stored row.

        ``statement`` must already include ``on_conflict_do_nothing(index_elements=[id])``
        and ``RETURNING *``. On a conflict we read the existing row inside the same
        transaction, which is race-safe because the conflicting row is already committed
        (or being written by a concurrent transaction that has finished the insert).
        """

        def _first(result: Any) -> sa.Row[Any] | None:
            return result.first()

        if self._connection is not None:
            row = _first(await self._connection.execute(statement))
            if row is None:
                row = _first(await self._connection.execute(sa.select(table).where(table.c.id == id_value)))
        else:
            async with self._engine.begin() as connection:
                row = _first(await connection.execute(statement))
                if row is None:
                    row = _first(await connection.execute(sa.select(table).where(table.c.id == id_value)))
        if row is None:
            raise RuntimeError(f"insert into {table.name} returned no row")
        return row

    @staticmethod
    def _record(record_type: type[RecordT], row: sa.Row[Any]) -> RecordT:
        return record_type(**dict(row._mapping))

    # --- research runs --------------------------------------------------------

    async def get_run(self, run_id: UUID) -> ResearchRunRecord | None:
        row = await self._fetchone(sa.select(tables.research_runs).where(tables.research_runs.c.id == run_id))
        return None if row is None else self._record(ResearchRunRecord, row)

    async def update_run_progress(
        self,
        run_id: UUID,
        *,
        state: str | None = None,
        spent_usd: Decimal | float | None = None,
        completed_at: datetime | None = None,
    ) -> ResearchRunRecord | None:
        values: dict[str, Any] = {}
        if state is not None:
            values["state"] = state
        if spent_usd is not None:
            values["spent_usd"] = spent_usd
        if completed_at is not None:
            values["completed_at"] = completed_at
        if not values:
            raise ValueError("update_run_progress requires at least one field")
        statement = (
            sa.update(tables.research_runs)
            .where(tables.research_runs.c.id == run_id)
            .values(**values)
            .returning(*tables.research_runs.c)
        )
        row = await self._fetchone(statement)
        return None if row is None else self._record(ResearchRunRecord, row)

    async def add_run_cost(self, run_id: UUID, cost_usd: Decimal | float) -> ResearchRunRecord | None:
        cost = cost_usd if isinstance(cost_usd, Decimal) else Decimal(str(cost_usd))
        statement = (
            sa.update(tables.research_runs)
            .where(tables.research_runs.c.id == run_id)
            .values(spent_usd=tables.research_runs.c.spent_usd + cost)
            .returning(*tables.research_runs.c)
        )
        row = await self._fetchone(statement)
        return None if row is None else self._record(ResearchRunRecord, row)

    async def get_run_cost(self, run_id: UUID) -> Decimal:
        """Total LLM cost recorded in ``llm_calls`` for a run."""
        value = await self._fetchone(
            sa.select(sa.func.coalesce(sa.func.sum(tables.llm_calls.c.cost_usd), 0)).where(
                tables.llm_calls.c.run_id == run_id
            )
        )
        if value is None:
            return Decimal(0)
        return Decimal(str(value[0]))

    # --- briefs ---------------------------------------------------------------

    async def get_brief(self, brief_id: UUID) -> ResearchBriefRecord | None:
        row = await self._fetchone(
            sa.select(tables.research_briefs).where(tables.research_briefs.c.id == brief_id)
        )
        return None if row is None else self._record(ResearchBriefRecord, row)

    async def get_latest_brief(self, idea_id: UUID) -> ResearchBriefRecord | None:
        row = await self._fetchone(
            sa.select(tables.research_briefs)
            .where(tables.research_briefs.c.idea_id == idea_id)
            .order_by(tables.research_briefs.c.version.desc(), tables.research_briefs.c.id.desc())
            .limit(1)
        )
        return None if row is None else self._record(ResearchBriefRecord, row)

    # --- sources --------------------------------------------------------------

    async def upsert_source(
        self,
        *,
        url: str,
        content_hash: str,
        source_type: str,
        title: str | None = None,
        publisher: str | None = None,
        published_at: date | None = None,
        snapshot_uri: str | None = None,
        accessed_at: datetime | None = None,
    ) -> SourceRecord:
        """Idempotent insert keyed by the schema's ``(url, content_hash)`` unique constraint.

        Identity fields (``id``, ``url``, ``content_hash``, ``accessed_at``) are preserved
        on conflict. Mutable metadata is refreshed: ``source_type`` is replaced, while
        nullable metadata uses ``COALESCE`` so a sparse retry does not erase known values.
        """
        values: dict[str, Any] = {
            "url": url,
            "content_hash": content_hash,
            "source_type": source_type,
        }
        if title is not None:
            values["title"] = title
        if publisher is not None:
            values["publisher"] = publisher
        if published_at is not None:
            values["published_at"] = published_at
        if snapshot_uri is not None:
            values["snapshot_uri"] = snapshot_uri
        if accessed_at is not None:
            values["accessed_at"] = accessed_at

        statement = pg_insert(tables.sources).values(**values)
        statement = statement.on_conflict_do_update(
            index_elements=[tables.sources.c.url, tables.sources.c.content_hash],
            set_={
                "title": sa.func.coalesce(statement.excluded.title, tables.sources.c.title),
                "publisher": sa.func.coalesce(statement.excluded.publisher, tables.sources.c.publisher),
                "published_at": sa.func.coalesce(
                    statement.excluded.published_at, tables.sources.c.published_at
                ),
                "source_type": statement.excluded.source_type,
                "snapshot_uri": sa.func.coalesce(
                    statement.excluded.snapshot_uri, tables.sources.c.snapshot_uri
                ),
            },
        ).returning(*tables.sources.c)
        row = await self._fetchone(statement)
        if row is None:
            raise RuntimeError("upsert into sources returned no row")
        return self._record(SourceRecord, row)

    async def get_source(self, source_id: UUID) -> SourceRecord | None:
        row = await self._fetchone(sa.select(tables.sources).where(tables.sources.c.id == source_id))
        return None if row is None else self._record(SourceRecord, row)

    async def get_source_by_key(self, *, url: str, content_hash: str) -> SourceRecord | None:
        row = await self._fetchone(
            sa.select(tables.sources).where(
                tables.sources.c.url == url,
                tables.sources.c.content_hash == content_hash,
            )
        )
        return None if row is None else self._record(SourceRecord, row)

    # --- evidence -------------------------------------------------------------

    async def insert_evidence(
        self,
        *,
        run_id: UUID,
        source_id: UUID,
        claim_text: str,
        quote: str,
        evidence_id: UUID | None = None,
        value: Decimal | float | None = None,
        unit: str | None = None,
        entity: str | None = None,
        observed_at: date | None = None,
        stance: str | None = None,
        relevance: Decimal | float | None = None,
        kind: str | None = None,
        embedding: Sequence[float] | None = None,
    ) -> EvidenceRecord:
        """Insert evidence; pass a deterministic UUID to make re-runs a no-op."""
        evidence_id = evidence_id or uuid4()
        values: dict[str, Any] = {
            "id": evidence_id,
            "run_id": run_id,
            "source_id": source_id,
            "claim_text": claim_text,
            "quote": quote,
        }
        if value is not None:
            values["value"] = value
        if unit is not None:
            values["unit"] = unit
        if entity is not None:
            values["entity"] = entity
        if observed_at is not None:
            values["observed_at"] = observed_at
        if stance is not None:
            values["stance"] = stance
        if relevance is not None:
            values["relevance"] = relevance
        if kind is not None:
            values["kind"] = kind
        if embedding is not None:
            values["embedding"] = list(embedding)

        statement = (
            pg_insert(tables.evidence)
            .values(**values)
            .on_conflict_do_nothing(index_elements=[tables.evidence.c.id])
            .returning(*tables.evidence.c)
        )
        row = await self._insert_idempotent(statement, tables.evidence, evidence_id)
        return self._record(EvidenceRecord, row)

    async def get_evidence(self, evidence_id: UUID) -> EvidenceRecord | None:
        row = await self._fetchone(sa.select(tables.evidence).where(tables.evidence.c.id == evidence_id))
        return None if row is None else self._record(EvidenceRecord, row)

    async def list_evidence_for_run(self, run_id: UUID) -> list[EvidenceRecord]:
        rows = await self._fetchall(
            sa.select(tables.evidence)
            .where(tables.evidence.c.run_id == run_id)
            .order_by(tables.evidence.c.created_at, tables.evidence.c.id)
        )
        return [self._record(EvidenceRecord, row) for row in rows]

    # --- claims ---------------------------------------------------------------

    async def insert_claim(
        self,
        *,
        idea_id: UUID,
        statement: str,
        module: str,
        status: str,
        claim_id: UUID | None = None,
        run_id: UUID | None = None,
        origin: str | None = None,
        kind: str | None = None,
        status_computed_at: datetime | None = None,
    ) -> ClaimRecord:
        """Insert a claim; pass a deterministic UUID to make crosscheck re-runs a no-op."""
        claim_id = claim_id or uuid4()
        values: dict[str, Any] = {
            "id": claim_id,
            "idea_id": idea_id,
            "statement": statement,
            "module": module,
            "status": status,
        }
        if run_id is not None:
            values["run_id"] = run_id
        if origin is not None:
            values["origin"] = origin
        if kind is not None:
            values["kind"] = kind
        if status_computed_at is not None:
            values["status_computed_at"] = status_computed_at

        insert = (
            pg_insert(tables.claims)
            .values(**values)
            .on_conflict_do_nothing(index_elements=[tables.claims.c.id])
            .returning(*tables.claims.c)
        )
        row = await self._insert_idempotent(insert, tables.claims, claim_id)
        return self._record(ClaimRecord, row)

    async def get_claim(self, claim_id: UUID) -> ClaimRecord | None:
        row = await self._fetchone(sa.select(tables.claims).where(tables.claims.c.id == claim_id))
        return None if row is None else self._record(ClaimRecord, row)

    async def list_claims_for_idea(
        self,
        idea_id: UUID,
        *,
        module: str | None = None,
        status: str | None = None,
    ) -> list[ClaimRecord]:
        query = sa.select(tables.claims).where(tables.claims.c.idea_id == idea_id)
        if module is not None:
            query = query.where(tables.claims.c.module == module)
        if status is not None:
            query = query.where(tables.claims.c.status == status)
        rows = await self._fetchall(query.order_by(tables.claims.c.created_at, tables.claims.c.id))
        return [self._record(ClaimRecord, row) for row in rows]

    async def link_claim_evidence(self, claim_id: UUID, evidence_id: UUID) -> bool:
        statement = (
            pg_insert(tables.claim_evidence)
            .values(claim_id=claim_id, evidence_id=evidence_id)
            .on_conflict_do_nothing(
                index_elements=[tables.claim_evidence.c.claim_id, tables.claim_evidence.c.evidence_id]
            )
            .returning(tables.claim_evidence.c.claim_id)
        )
        row = await self._fetchone(statement)
        return row is not None

    async def link_claim_contradiction(
        self,
        claim_id: UUID,
        contradicts_claim_id: UUID,
        *,
        note: str | None = None,
    ) -> bool:
        values: dict[str, Any] = {
            "claim_id": claim_id,
            "contradicts_claim_id": contradicts_claim_id,
        }
        if note is not None:
            values["note"] = note
        statement = (
            pg_insert(tables.claim_contradictions)
            .values(**values)
            .on_conflict_do_nothing(
                index_elements=[
                    tables.claim_contradictions.c.claim_id,
                    tables.claim_contradictions.c.contradicts_claim_id,
                ]
            )
            .returning(tables.claim_contradictions.c.claim_id)
        )
        row = await self._fetchone(statement)
        return row is not None

    # --- insights -------------------------------------------------------------

    async def insert_insight(
        self,
        *,
        idea_id: UUID,
        module: str,
        summary: str,
        cited_claim_ids: Sequence[UUID],
        insight_id: UUID | None = None,
        run_id: UUID | None = None,
    ) -> InsightRecord:
        insight_id = insight_id or uuid4()
        values: dict[str, Any] = {
            "id": insight_id,
            "idea_id": idea_id,
            "module": module,
            "summary": summary,
            "cited_claim_ids": list(cited_claim_ids),
        }
        if run_id is not None:
            values["run_id"] = run_id
        statement = (
            pg_insert(tables.insights)
            .values(**values)
            .on_conflict_do_nothing(index_elements=[tables.insights.c.id])
            .returning(*tables.insights.c)
        )
        row = await self._insert_idempotent(statement, tables.insights, insight_id)
        return self._record(InsightRecord, row)

    async def list_insights_for_run(self, run_id: UUID) -> list[InsightRecord]:
        rows = await self._fetchall(
            sa.select(tables.insights)
            .where(tables.insights.c.run_id == run_id)
            .order_by(tables.insights.c.created_at, tables.insights.c.id)
        )
        return [self._record(InsightRecord, row) for row in rows]

    # --- recommendations / assumptions ---------------------------------------

    async def insert_recommendation(
        self,
        *,
        idea_id: UUID,
        action: str,
        rationale: str,
        cited_claim_ids: Sequence[UUID],
        linked_assumption_ids: Sequence[UUID] = (),
        recommendation_id: UUID | None = None,
        run_id: UUID | None = None,
        confidence: Decimal | float | None = None,
    ) -> RecommendationRecord:
        recommendation_id = recommendation_id or uuid4()
        values: dict[str, Any] = {
            "id": recommendation_id,
            "idea_id": idea_id,
            "action": action,
            "rationale": rationale,
            "cited_claim_ids": list(cited_claim_ids),
            "linked_assumption_ids": list(linked_assumption_ids),
        }
        if run_id is not None:
            values["run_id"] = run_id
        if confidence is not None:
            values["confidence"] = confidence
        statement = (
            pg_insert(tables.recommendations)
            .values(**values)
            .on_conflict_do_nothing(index_elements=[tables.recommendations.c.id])
            .returning(*tables.recommendations.c)
        )
        row = await self._insert_idempotent(statement, tables.recommendations, recommendation_id)
        return self._record(RecommendationRecord, row)

    async def list_recommendations_for_idea(self, idea_id: UUID) -> list[RecommendationRecord]:
        rows = await self._fetchall(
            sa.select(tables.recommendations)
            .where(tables.recommendations.c.idea_id == idea_id)
            .order_by(tables.recommendations.c.created_at, tables.recommendations.c.id)
        )
        return [self._record(RecommendationRecord, row) for row in rows]

    async def insert_assumption(
        self,
        *,
        idea_id: UUID,
        type: str,
        statement: str,
        assumption_id: UUID | None = None,
        importance: str | None = None,
        status: str | None = None,
        linked_claim_ids: Sequence[UUID] = (),
    ) -> AssumptionRecord:
        assumption_id = assumption_id or uuid4()
        values: dict[str, Any] = {
            "id": assumption_id,
            "idea_id": idea_id,
            "type": type,
            "statement": statement,
            "linked_claim_ids": list(linked_claim_ids),
        }
        if importance is not None:
            values["importance"] = importance
        if status is not None:
            values["status"] = status
        insert = (
            pg_insert(tables.assumptions)
            .values(**values)
            .on_conflict_do_nothing(index_elements=[tables.assumptions.c.id])
            .returning(*tables.assumptions.c)
        )
        row = await self._insert_idempotent(insert, tables.assumptions, assumption_id)
        return self._record(AssumptionRecord, row)

    # --- opportunity scores --------------------------------------------------

    async def insert_opportunity_score(
        self,
        *,
        idea_id: UUID,
        dimension_scores: Mapping[str, Any],
        overall_score: Decimal | float,
        evidence_coverage: Decimal | float,
        scoring_model_version: str,
        score_id: UUID | None = None,
        run_id: UUID | None = None,
    ) -> OpportunityScoreRecord:
        score_id = score_id or uuid4()
        values: dict[str, Any] = {
            "id": score_id,
            "idea_id": idea_id,
            "dimension_scores": dict(dimension_scores),
            "overall_score": overall_score,
            "evidence_coverage": evidence_coverage,
            "scoring_model_version": scoring_model_version,
        }
        if run_id is not None:
            values["run_id"] = run_id
        statement = (
            pg_insert(tables.opportunity_scores)
            .values(**values)
            .on_conflict_do_nothing(index_elements=[tables.opportunity_scores.c.id])
            .returning(*tables.opportunity_scores.c)
        )
        row = await self._insert_idempotent(statement, tables.opportunity_scores, score_id)
        return self._record(OpportunityScoreRecord, row)

    async def get_latest_opportunity_score(self, idea_id: UUID) -> OpportunityScoreRecord | None:
        row = await self._fetchone(
            sa.select(tables.opportunity_scores)
            .where(tables.opportunity_scores.c.idea_id == idea_id)
            .order_by(
                tables.opportunity_scores.c.created_at.desc(),
                tables.opportunity_scores.c.id.desc(),
            )
            .limit(1)
        )
        return None if row is None else self._record(OpportunityScoreRecord, row)

    # --- observability --------------------------------------------------------

    async def insert_llm_call(
        self,
        *,
        task: str,
        model: str,
        run_id: UUID | None = None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        cost_usd: Decimal | float | None = None,
        latency_ms: int | None = None,
        status: str | None = None,
    ) -> LlmCallRecord:
        values: dict[str, Any] = {"task": task, "model": model}
        if run_id is not None:
            values["run_id"] = run_id
        if input_tokens is not None:
            values["input_tokens"] = input_tokens
        if output_tokens is not None:
            values["output_tokens"] = output_tokens
        if cost_usd is not None:
            values["cost_usd"] = cost_usd
        if latency_ms is not None:
            values["latency_ms"] = latency_ms
        if status is not None:
            values["status"] = status
        row = await self._fetchone(
            pg_insert(tables.llm_calls).values(**values).returning(*tables.llm_calls.c)
        )
        if row is None:
            raise RuntimeError("insert into llm_calls returned no row")
        return self._record(LlmCallRecord, row)


__all__ = ["PostgresRepository"]
