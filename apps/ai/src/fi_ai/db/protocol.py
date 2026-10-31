"""Persistence contract used by the research pipeline.

No shared Protocol existed on the base branch when S2-15 started (the issue text assumed it
would be merged first). This module defines the smallest contract needed by the pipeline
stages and the orchestrator; ``PostgresRepository`` is the SQLAlchemy Core implementation.

All methods are asynchronous and atomic: a single method opens one transaction, and
``transaction()`` can be used to group several calls.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Protocol, runtime_checkable
from uuid import UUID

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


@runtime_checkable
class ResearchRepository(Protocol):
    """Operations the AI service needs to persist research output."""

    async def get_run(self, run_id: UUID) -> ResearchRunRecord | None: ...

    async def update_run_progress(
        self,
        run_id: UUID,
        *,
        state: str | None = None,
        spent_usd: Decimal | float | None = None,
        completed_at: datetime | None = None,
    ) -> ResearchRunRecord | None: ...

    async def add_run_cost(self, run_id: UUID, cost_usd: Decimal | float) -> ResearchRunRecord | None: ...

    async def get_run_cost(self, run_id: UUID) -> Decimal: ...

    async def get_brief(self, brief_id: UUID) -> ResearchBriefRecord | None: ...

    async def get_latest_brief(self, idea_id: UUID) -> ResearchBriefRecord | None: ...

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
    ) -> SourceRecord: ...

    async def get_source(self, source_id: UUID) -> SourceRecord | None: ...

    async def get_source_by_key(self, *, url: str, content_hash: str) -> SourceRecord | None: ...

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
    ) -> EvidenceRecord: ...

    async def get_evidence(self, evidence_id: UUID) -> EvidenceRecord | None: ...

    async def list_evidence_for_run(self, run_id: UUID) -> list[EvidenceRecord]: ...

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
    ) -> ClaimRecord: ...

    async def get_claim(self, claim_id: UUID) -> ClaimRecord | None: ...

    async def list_claims_for_idea(
        self,
        idea_id: UUID,
        *,
        module: str | None = None,
        status: str | None = None,
    ) -> list[ClaimRecord]: ...

    async def link_claim_evidence(self, claim_id: UUID, evidence_id: UUID) -> bool: ...

    async def link_claim_contradiction(
        self,
        claim_id: UUID,
        contradicts_claim_id: UUID,
        *,
        note: str | None = None,
    ) -> bool: ...

    async def insert_insight(
        self,
        *,
        idea_id: UUID,
        module: str,
        summary: str,
        cited_claim_ids: Sequence[UUID],
        insight_id: UUID | None = None,
        run_id: UUID | None = None,
    ) -> InsightRecord: ...

    async def list_insights_for_run(self, run_id: UUID) -> list[InsightRecord]: ...

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
    ) -> RecommendationRecord: ...

    async def list_recommendations_for_idea(self, idea_id: UUID) -> list[RecommendationRecord]: ...

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
    ) -> AssumptionRecord: ...

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
    ) -> OpportunityScoreRecord: ...

    async def get_latest_opportunity_score(self, idea_id: UUID) -> OpportunityScoreRecord | None: ...

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
    ) -> LlmCallRecord: ...


__all__ = ["ResearchRepository"]
