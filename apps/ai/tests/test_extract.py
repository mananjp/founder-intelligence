"""Unit tests for structured evidence extraction (``fi_ai.evidence.extract``).

Tests are independent of a real database and real LLM provider: they inject
fixture model responses (``fi_ai.llm.fake.FakeLLM``) and an in-memory
repository implementing ``fi_ai.db.protocol.ResearchRepository``.
"""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest

from fi_ai.db.records import EvidenceRecord
from fi_ai.evidence.embedding import EmbeddingProviderError
from fi_ai.evidence.extract import (
    ExtractionError,
    ExtractionResult,
    extract_from_snapshot,
    insert_verified_evidence,
)
from fi_ai.evidence.schemas import ExtractedEvidence
from fi_ai.evidence.verbatim import VerbatimRejectionError
from fi_ai.llm.fake import FakeLLM
from fi_ai.llm.router import reset_completion_backend, set_completion_backend

RUN_ID = uuid4()
SOURCE_ID = uuid4()
SNAPSHOT = (
    "Acme launched its new platform in 2024. The platform is designed for "
    "small businesses. Revenue reached $10 million in 2025."
)


class _FakeRepo:
    """In-memory ResearchRepository subset used by extraction tests."""

    def __init__(self):
        self.rows: list[EvidenceRecord] = []
        self.insert_calls = 0

    async def insert_evidence(
        self,
        *,
        run_id,
        source_id,
        claim_text,
        quote,
        evidence_id=None,
        value=None,
        unit=None,
        entity=None,
        observed_at=None,
        stance=None,
        relevance=None,
        kind=None,
        embedding=None,
    ) -> EvidenceRecord:
        self.insert_calls += 1
        return EvidenceRecord(
            id=evidence_id or uuid4(),
            run_id=run_id,
            source_id=source_id,
            claim_text=claim_text,
            quote=quote,
            value=value,
            unit=unit,
            entity=entity,
            observed_at=observed_at,
            stance=stance or "supports",
            relevance=relevance or Decimal("0.70"),
            kind=kind or "fact",
            embedding=list(embedding) if embedding is not None else None,
            created_at=datetime.now(UTC),
        )

    async def get_evidence(self, evidence_id):  # pragma: no cover - unused here
        raise NotImplementedError

    async def list_evidence_for_run(self, run_id):  # pragma: no cover - unused here
        raise NotImplementedError

    # Remaining ResearchRepository members are not exercised by these tests.
    async def get_run(self, run_id):  # pragma: no cover
        raise NotImplementedError

    async def update_run_progress(self, run_id, **kwargs):  # pragma: no cover
        raise NotImplementedError

    async def add_run_cost(self, run_id, cost_usd):  # pragma: no cover
        raise NotImplementedError

    async def get_run_cost(self, run_id):  # pragma: no cover
        raise NotImplementedError

    async def get_brief(self, brief_id):  # pragma: no cover
        raise NotImplementedError

    async def get_latest_brief(self, idea_id):  # pragma: no cover
        raise NotImplementedError

    async def upsert_source(self, **kwargs):  # pragma: no cover
        raise NotImplementedError

    async def get_source(self, source_id):  # pragma: no cover
        raise NotImplementedError

    async def get_source_by_key(self, *, url, content_hash):  # pragma: no cover
        raise NotImplementedError

    async def insert_claim(self, **kwargs):  # pragma: no cover
        raise NotImplementedError

    async def get_claim(self, claim_id):  # pragma: no cover
        raise NotImplementedError

    async def list_claims_for_idea(self, idea_id, **kwargs):  # pragma: no cover
        raise NotImplementedError

    async def link_claim_evidence(self, claim_id, evidence_id):  # pragma: no cover
        raise NotImplementedError

    async def link_claim_contradiction(self, claim_id, contradicts_claim_id, **kwargs):  # pragma: no cover
        raise NotImplementedError

    async def insert_insight(self, **kwargs):  # pragma: no cover
        raise NotImplementedError

    async def list_insights_for_run(self, run_id):  # pragma: no cover
        raise NotImplementedError

    async def insert_recommendation(self, **kwargs):  # pragma: no cover
        raise NotImplementedError

    async def list_recommendations_for_idea(self, idea_id):  # pragma: no cover
        raise NotImplementedError

    async def insert_assumption(self, **kwargs):  # pragma: no cover
        raise NotImplementedError

    async def insert_opportunity_score(self, **kwargs):  # pragma: no cover
        raise NotImplementedError

    async def get_latest_opportunity_score(self, idea_id):  # pragma: no cover
        raise NotImplementedError

    async def insert_llm_call(self, **kwargs):  # pragma: no cover
        raise NotImplementedError

    def transaction(self):
        class _Tx:
            async def __aenter__(a):
                return self

            async def __aexit__(a, *exc):
                return False

        tx = _Tx()
        tx.insert_evidence = self.insert_evidence
        return tx


def _evidence_item(claim_text="Acme launched its new platform in 2024.", quote=None, **overrides):
    data = {
        "claim_text": claim_text,
        "quote": quote or claim_text,
        "stance": "supports",
        "relevance": 0.9,
        "kind": "fact",
    }
    data.update(overrides)
    return ExtractedEvidence(**data)


async def _run_extract(items, repo, snapshot=SNAPSHOT, embed_fn=None):
    import os

    os.environ["LLM_FAST_MODEL"] = "fast"
    if embed_fn is None:
        embed_fn = lambda text: [0.5] * 1536
    fake = FakeLLM().enqueue_json({"evidence": [item.model_dump() for item in items]})
    set_completion_backend(fake)
    try:
        return await extract_from_snapshot(
            run_id=RUN_ID,
            source_id=SOURCE_ID,
            snapshot_text=snapshot,
            repo=repo,
            embed_fn=embed_fn,
        )
    finally:
        reset_completion_backend()


def _embedding_vector(value=0.5, size=1536):
    return [value] * size


class _FakeEmbedding:
    def __init__(self, vector):
        self._vector = vector

    def __call__(self, *, model, input, **kwargs):
        class _V:
            embedding = self._vector

        class _R:
            def __init__(self) -> None:
                self.data = [_V()]

        return _R()


@pytest.mark.asyncio
async def test_valid_evidence_persists_with_embedding():
    repo = _FakeRepo()
    result = await _run_extract(
        [_evidence_item()],
        repo,
        embed_fn=lambda text: _embedding_vector(),
    )
    assert isinstance(result, ExtractionResult)
    assert result.accepted_count == 1
    assert result.evaluated == 1
    assert result.verbatim_rate == 1.0
    assert result.rejected_count == 0
    assert repo.insert_calls == 1

    record = result.accepted[0]
    assert record.claim_text == "Acme launched its new platform in 2024."
    assert record.quote == "Acme launched its new platform in 2024."
    assert record.source_id == SOURCE_ID
    assert record.run_id == RUN_ID
    assert record.embedding == _embedding_vector()


@pytest.mark.asyncio
async def test_paraphrase_quote_rejected_and_not_persisted():
    repo = _FakeRepo()
    result = await _run_extract(
        [
            _evidence_item(
                claim_text="The platform serves small businesses.",
                quote="Small businesses rely on the platform.",
            )
        ],
        repo,
    )
    assert result.accepted_count == 0
    assert result.rejected_count == 1
    assert result.evaluated == 1
    assert result.verbatim_rate == 0.0
    assert repo.insert_calls == 0
    assert "substring" in result.rejected[0].reason


@pytest.mark.asyncio
async def test_fabricated_quote_rejected():
    repo = _FakeRepo()
    result = await _run_extract(
        [
            _evidence_item(
                claim_text="Revenue reached $10 million in 2025.",
                quote="Revenue reached $100 million in 2025.",
            )
        ],
        repo,
    )
    assert result.accepted_count == 0
    assert result.rejected_count == 1
    assert result.evaluated == 1
    assert result.verbatim_rate == 0.0
    assert repo.insert_calls == 0


@pytest.mark.asyncio
async def test_quote_with_extra_unsupported_words_rejected():
    repo = _FakeRepo()
    result = await _run_extract(
        [
            _evidence_item(
                claim_text="Acme launched its new platform in 2024.",
                quote="Acme launched its amazing new platform in 2024.",
            )
        ],
        repo,
    )
    assert result.accepted_count == 0
    assert result.rejected_count == 1
    assert result.evaluated == 1
    assert result.verbatim_rate == 0.0
    assert repo.insert_calls == 0


@pytest.mark.asyncio
async def test_newline_quote_accepted_after_normalization():
    repo = _FakeRepo()
    snapshot = "Acme launched its new platform in 2024.\nIt is designed for small businesses."
    result = await _run_extract(
        [
            _evidence_item(
                claim_text="Acme launched its new platform in 2024. It is designed for small businesses.",
                quote="Acme launched its new platform in 2024. It is designed for small businesses.",
            )
        ],
        repo,
        snapshot=snapshot,
    )
    assert result.accepted_count == 1
    assert repo.insert_calls == 1


@pytest.mark.asyncio
async def test_mixed_accepted_and_rejected_in_one_batch():
    repo = _FakeRepo()
    result = await _run_extract(
        [
            _evidence_item(quote="Acme launched its new platform in 2024."),
            _evidence_item(quote="Fabricated extra wording here."),
            _evidence_item(quote="Revenue reached $10 million in 2025."),
        ],
        repo,
    )
    assert result.accepted_count == 2
    assert result.rejected_count == 1
    assert result.evaluated == 3
    assert result.verbatim_rate == pytest.approx(2 / 3)
    assert repo.insert_calls == 2


@pytest.mark.asyncio
async def test_wrong_snapshot_source_pairing_rejected():
    """Quote from snapshot B must not be accepted against snapshot A."""
    repo = _FakeRepo()
    result = await _run_extract(
        [_evidence_item(quote="Beta Corp filed its 10-K in March.")],
        repo,
        snapshot=SNAPSHOT,
    )
    assert result.accepted_count == 0
    assert result.rejected_count == 1
    assert result.evaluated == 1
    assert result.verbatim_rate == 0.0
    assert repo.insert_calls == 0


@pytest.mark.asyncio
async def test_empty_snapshot_rejects_all_quotes():
    repo = _FakeRepo()
    result = await _run_extract(
        [_evidence_item(quote="Acme launched its new platform in 2024.")],
        repo,
        snapshot="",
    )
    assert result.accepted_count == 0
    assert result.evaluated == 1
    assert result.verbatim_rate == 0.0
    assert repo.insert_calls == 0


@pytest.mark.asyncio
async def test_empty_dataset_rate_is_none_not_one():
    repo = _FakeRepo()
    result = await _run_extract([], repo)
    assert result.accepted_count == 0
    assert result.evaluated == 0
    assert result.verbatim_rate is None


@pytest.mark.asyncio
async def test_embedding_only_for_accepted_evidence():
    embedded_texts = []

    def embed_fn(text):
        embedded_texts.append(text)
        return _embedding_vector()

    repo = _FakeRepo()
    await _run_extract(
        [
            _evidence_item(quote="Acme launched its new platform in 2024."),
            _evidence_item(quote="Fabricated quote here."),
        ],
        repo,
        embed_fn=embed_fn,
    )
    assert repo.insert_calls == 1
    assert embedded_texts == ["Acme launched its new platform in 2024."]


@pytest.mark.asyncio
async def test_embedding_provider_failure_raises_and_persists_nothing():
    repo = _FakeRepo()
    with pytest.raises(ExtractionError, match="embedding generation failed"):
        await _run_extract(
            [_evidence_item(quote="Acme launched its new platform in 2024.")],
            repo,
            embed_fn=lambda text: (_ for _ in ()).throw(EmbeddingProviderError("down")),
        )
    assert repo.insert_calls == 0


@pytest.mark.asyncio
async def test_insert_verified_evidence_persistence_boundary():
    repo = _FakeRepo()

    record = await insert_verified_evidence(
        repo,
        run_id=RUN_ID,
        source_id=SOURCE_ID,
        snapshot_text=SNAPSHOT,
        claim_text="Acme launched its new platform in 2024.",
        quote="Acme launched its new platform in 2024.",
    )
    assert record.quote == "Acme launched its new platform in 2024."
    assert repo.insert_calls == 1


@pytest.mark.asyncio
async def test_insert_verified_evidence_rejects_invalid_quote_at_persistence_boundary():
    repo = _FakeRepo()

    with pytest.raises(VerbatimRejectionError):
        await insert_verified_evidence(
            repo,
            run_id=RUN_ID,
            source_id=SOURCE_ID,
            snapshot_text=SNAPSHOT,
            claim_text="x",
            quote="fabricated wording",
        )
    assert repo.insert_calls == 0


@pytest.mark.asyncio
async def test_model_validation_failure_propagates_and_persists_nothing():
    repo = _FakeRepo()
    fake = FakeLLM().enqueue_json(
        {"evidence": [{"claim_text": "tiny", "quote": "valid quote here"}]}
    )
    set_completion_backend(fake)
    try:
        with pytest.raises(ExtractionError):
            await extract_from_snapshot(
                run_id=RUN_ID,
                source_id=SOURCE_ID,
                snapshot_text=SNAPSHOT,
                repo=repo,
            )
    finally:
        reset_completion_backend()
    assert repo.insert_calls == 0


@pytest.mark.asyncio
async def test_verbatim_rate_deterministic():
    snapshot = "alpha beta gamma"
    cases = (
        (["alpha beta", "alpha beta", "alpha beta"], 1.0, 0),
        (["gamma delta"], 0.0, 1),  # fabricated quote
        ([], None, 0),
    )
    for quotes, expected_rate, expected_rejected in cases:
        repo = _FakeRepo()
        items = [_evidence_item(quote=q) for q in quotes]
        result = await _run_extract(items, repo, snapshot=snapshot)
        assert result.verbatim_rate == expected_rate
        assert result.rejected_count == expected_rejected
