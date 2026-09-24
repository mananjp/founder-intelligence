from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class ClaimStatus(StrEnum):
    VERIFIED = "verified"
    SUPPORTED = "supported"
    DIRECTIONAL = "directional"
    CONFLICTING = "conflicting"
    INFERRED = "inferred"
    ASSUMPTION = "assumption"
    UNVERIFIED = "unverified"


class SourceType(StrEnum):
    OFFICIAL_SITE = "official_site"
    GOVERNMENT = "government"
    FILING = "filing"
    ACADEMIC = "academic"
    REVIEW = "review"
    COMMUNITY = "community"
    SEARCH_TREND = "search_trend"
    INDUSTRY_REPORT = "industry_report"
    NEWS = "news"
    JOB_POSTING = "job_posting"
    DEVELOPER = "developer"
    USER_UPLOAD = "user_upload"
    OTHER = "other"


class Source(BaseModel):
    url: str
    title: str | None = None
    publisher: str | None = None
    published_at: date | None = None
    accessed_at: datetime
    source_type: SourceType
    content_hash: str
    snapshot_uri: str | None = None  # object-storage copy of what we actually read


class ExtractedEvidence(BaseModel):
    """LLM extraction output. `quote` MUST be a verbatim substring of the fetched snapshot (validated in extract stage)."""

    claim_text: str = Field(min_length=5)
    quote: str = Field(min_length=5)
    value: float | None = None
    unit: str | None = None
    entity: str | None = None
    observed_at: date | None = None
    stance: str = "supports"  # supports | contradicts
    relevance: float = Field(ge=0, le=1, default=0.7)
    kind: str = "fact"  # fact | signal
