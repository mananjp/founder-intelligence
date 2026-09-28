from datetime import UTC, date, datetime

import pytest
from pydantic import ValidationError

from fi_ai.evidence.schemas import ClaimStatus, ExtractedEvidence, Source, SourceType


def test_source_accepts_optional_metadata():
    source = Source(
        url="https://example.com",
        accessed_at=datetime(2026, 1, 1, tzinfo=UTC),
        source_type=SourceType.NEWS,
        content_hash="abc",
    )

    assert source.title is None
    assert source.published_at is None
    assert source.source_type == SourceType.NEWS


def test_source_parses_published_date_and_snapshot_uri():
    source = Source(
        url="https://example.com",
        published_at="2025-12-31",
        accessed_at=datetime(2026, 1, 1, tzinfo=UTC),
        source_type="official_site",
        content_hash="abc",
        snapshot_uri="s3://bucket/snapshot",
    )

    assert source.published_at == date(2025, 12, 31)
    assert source.snapshot_uri == "s3://bucket/snapshot"


def test_extracted_evidence_defaults_and_bounds():
    evidence = ExtractedEvidence(claim_text="A long enough claim", quote="A verbatim quote")

    assert evidence.stance == "supports"
    assert evidence.relevance == 0.7
    assert evidence.kind == "fact"
    with pytest.raises(ValidationError):
        ExtractedEvidence(claim_text="tiny", quote="quote")
    with pytest.raises(ValidationError):
        ExtractedEvidence(claim_text="A long enough claim", quote="A verbatim quote", relevance=1.1)


def test_status_enum_contains_expected_values():
    assert ClaimStatus.VERIFIED.value == "verified"
    assert ClaimStatus.UNVERIFIED.value == "unverified"
