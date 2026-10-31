"""Immutable record types returned by the persistence repositories."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID


@dataclass(frozen=True, slots=True)
class ResearchRunRecord:
    id: UUID
    workspace_id: UUID
    idea_id: UUID
    brief_id: UUID
    depth: str
    geography: list[str]
    state: str
    budget_usd: Decimal | None
    spent_usd: Decimal
    created_by: UUID
    created_at: datetime
    completed_at: datetime | None


@dataclass(frozen=True, slots=True)
class ResearchBriefRecord:
    id: UUID
    idea_id: UUID
    version: int
    problem: str | None
    customer: str | None
    geography: list[str] | None
    category: str | None
    alternatives: str | None
    business_model: str | None
    differentiation: str | None
    known_evidence: Any
    unknowns: Any
    research_questions: Any
    created_at: datetime


@dataclass(frozen=True, slots=True)
class SourceRecord:
    id: UUID
    url: str
    content_hash: str
    title: str | None
    publisher: str | None
    published_at: date | None
    source_type: str
    accessed_at: datetime
    snapshot_uri: str | None


@dataclass(frozen=True, slots=True)
class EvidenceRecord:
    id: UUID
    run_id: UUID
    source_id: UUID
    claim_text: str
    quote: str
    value: Decimal | None
    unit: str | None
    entity: str | None
    observed_at: date | None
    stance: str
    relevance: Decimal
    kind: str
    embedding: list[float] | None
    created_at: datetime


@dataclass(frozen=True, slots=True)
class ClaimRecord:
    id: UUID
    idea_id: UUID
    run_id: UUID | None
    statement: str
    module: str
    origin: str
    kind: str
    status: str
    status_computed_at: datetime
    created_at: datetime


@dataclass(frozen=True, slots=True)
class InsightRecord:
    id: UUID
    idea_id: UUID
    run_id: UUID | None
    module: str
    summary: str
    cited_claim_ids: list[UUID]
    created_at: datetime


@dataclass(frozen=True, slots=True)
class RecommendationRecord:
    id: UUID
    idea_id: UUID
    run_id: UUID | None
    action: str
    rationale: str
    cited_claim_ids: list[UUID]
    linked_assumption_ids: list[UUID]
    confidence: Decimal | None
    created_at: datetime


@dataclass(frozen=True, slots=True)
class AssumptionRecord:
    id: UUID
    idea_id: UUID
    type: str
    statement: str
    importance: str
    status: str
    linked_claim_ids: list[UUID]
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class OpportunityScoreRecord:
    id: UUID
    idea_id: UUID
    run_id: UUID | None
    dimension_scores: Any
    overall_score: Decimal
    evidence_coverage: Decimal
    scoring_model_version: str
    created_at: datetime


@dataclass(frozen=True, slots=True)
class LlmCallRecord:
    id: int
    run_id: UUID | None
    task: str
    model: str
    input_tokens: int | None
    output_tokens: int | None
    cost_usd: Decimal | None
    latency_ms: int | None
    status: str
    created_at: datetime


__all__ = [
    "AssumptionRecord",
    "ClaimRecord",
    "EvidenceRecord",
    "InsightRecord",
    "LlmCallRecord",
    "OpportunityScoreRecord",
    "RecommendationRecord",
    "ResearchBriefRecord",
    "ResearchRunRecord",
    "SourceRecord",
]
