"""Focused tests for the Crosscheck pipeline stage."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID

import pytest

from fi_ai.evidence.schemas import ClaimStatus
from fi_ai.research.pipeline import crosscheck

RUN_ID = "22222222-2222-4222-8222-222222222222"
RUN_UUID = UUID(RUN_ID)


def evidence_row(
    *,
    evidence_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    claim_text="The market is growing",
    embedding=None,
    publisher="Publisher A",
    source_type="news",
    stance="supports",
    relevance=0.9,
    kind="fact",
    published_at=None,
    observed_at=None,
):
    return {
        "id": UUID(evidence_id),
        "claim_text": claim_text,
        "quote": "The market is growing rapidly",
        "stance": stance,
        "relevance": relevance,
        "kind": kind,
        "embedding": embedding,
        "observed_at": observed_at,
        "publisher": publisher,
        "source_type": source_type,
        "published_at": published_at,
        "url": "https://example.com/report",
    }


def test_database_dsn_converts_sqlalchemy_scheme(monkeypatch):
    monkeypatch.setattr(crosscheck.settings, "database_url", "postgresql+psycopg://u:p@localhost/db")
    assert crosscheck._database_dsn() == "postgresql://u:p@localhost/db"


def test_database_dsn_keeps_regular_postgres_url(monkeypatch):
    monkeypatch.setattr(crosscheck.settings, "database_url", "postgresql://u:p@localhost/db")
    assert crosscheck._database_dsn() == "postgresql://u:p@localhost/db"


def test_cosine_similarity_handles_normal_and_zero_vectors():
    assert crosscheck._cosine([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)
    assert crosscheck._cosine([0.0, 0.0], [1.0, 0.0]) == 0.0


def test_cosine_rejects_different_vector_dimensions():
    with pytest.raises(ValueError):
        crosscheck._cosine([1.0], [1.0, 2.0])


def test_publisher_normalization_and_fallback():
    assert crosscheck._normalise_publisher("  ACME   NEWS ", "fallback") == "acme news"
    assert crosscheck._normalise_publisher(None, "fallback") == "fallback"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Subscription pricing increased", "pricing"),
        ("Enterprise customer adoption", "customer"),
        ("A major competitor entered", "competitive"),
        ("Demand growth is accelerating", "demand"),
        ("Sales distribution channel", "gtm"),
        ("Total addressable market estimate", "market"),
    ],
)
def test_module_mapping(text, expected):
    assert crosscheck._module_for(text) == expected


def test_claim_id_is_stable_and_normalizes_statement():
    first = crosscheck._claim_id(RUN_UUID, "market", " Market   Growth ")
    second = crosscheck._claim_id(RUN_UUID, "market", "market growth")
    assert first == second


def test_vector_parses_list_string_and_iterable():
    assert crosscheck._vector([1, "2"]) == [1.0, 2.0]
    assert crosscheck._vector("[1,2.5]") == [1.0, 2.5]
    assert crosscheck._vector((1, 2)) == [1.0, 2.0]


def test_cluster_rows_groups_similar_embeddings_and_separates_dissimilar():
    rows = [
        evidence_row(embedding=[1.0, 0.0]),
        evidence_row(
            evidence_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            claim_text="The market is growing rapidly",
            embedding=[0.99, 0.01],
        ),
        evidence_row(
            evidence_id="cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            claim_text="Pricing is decreasing",
            embedding=[0.0, 1.0],
        ),
    ]
    clusters = crosscheck._cluster_rows(rows)
    assert [len(cluster) for cluster in clusters] == [2, 1]


def test_embed_texts_empty_does_not_call_provider(monkeypatch):
    assert crosscheck._embed_texts([]) == []


def test_embed_texts_uses_configured_embedding_model(monkeypatch):
    import litellm

    monkeypatch.setattr(crosscheck, "model_for", lambda task: "provider/embed-model")
    monkeypatch.setattr(
        litellm,
        "embedding",
        lambda **kwargs: SimpleNamespace(data=[{"embedding": [0.1] * 1536}]),
    )
    vectors = crosscheck._embed_texts(["one"])
    assert len(vectors) == 1
    assert len(vectors[0]) == 1536


def test_embed_texts_rejects_wrong_dimension(monkeypatch):
    import litellm

    monkeypatch.setattr(crosscheck, "model_for", lambda task: "provider/embed-model")
    monkeypatch.setattr(
        litellm,
        "embedding",
        lambda **kwargs: SimpleNamespace(data=[{"embedding": [0.1, 0.2]}]),
    )
    with pytest.raises(ValueError, match="dimension"):
        crosscheck._embed_texts(["one"])


def test_ensure_embeddings_updates_missing_vectors(monkeypatch):
    cursor = Mock()
    row = evidence_row(embedding=None)
    monkeypatch.setattr(crosscheck, "_embed_texts", lambda texts: [[0.25] * 1536])
    crosscheck._ensure_embeddings(cursor, [row])
    assert row["embedding"] == [0.25] * 1536
    cursor.execute.assert_called_once()


def test_ensure_embeddings_skips_existing_vectors(monkeypatch):
    cursor = Mock()
    row = evidence_row(embedding=[1.0, 0.0])
    monkeypatch.setattr(crosscheck, "_embed_texts", lambda texts: pytest.fail("must not embed"))
    crosscheck._ensure_embeddings(cursor, [row])
    cursor.execute.assert_not_called()


def test_refine_clusters_keeps_contradictory_claims_separate(monkeypatch):
    rows = [
        evidence_row(embedding=[1.0, 0.0], claim_text="Revenue increased"),
        evidence_row(
            evidence_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            embedding=[0.99, 0.01],
            claim_text="Revenue decreased",
        ),
    ]
    monkeypatch.setattr(
        crosscheck,
        "_nli_judgment",
        lambda *_: crosscheck.NliResult(
            relation="contradicts", confidence=0.95, explanation="Opposite direction"
        ),
    )
    assert [len(cluster) for cluster in crosscheck._refine_clusters(RUN_ID, [rows])] == [1, 1]


def test_refine_clusters_merges_nli_equivalent_claims(monkeypatch):
    rows = [
        evidence_row(embedding=[1.0, 0.0], claim_text="Revenue increased"),
        evidence_row(
            evidence_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            embedding=[0.99, 0.01],
            claim_text="Revenue rose",
        ),
    ]
    monkeypatch.setattr(
        crosscheck,
        "_nli_judgment",
        lambda *_: crosscheck.NliResult(
            relation="same", confidence=0.95, explanation="Same proposition"
        ),
    )
    assert [len(cluster) for cluster in crosscheck._refine_clusters(RUN_ID, [rows])] == [2]


def test_nli_judgment_uses_registered_prompt_and_fast_task(monkeypatch):
    prompt = SimpleNamespace(system="system", user_template="A={statement_a}; B={statement_b}")
    monkeypatch.setattr(crosscheck, "load_prompt", lambda *_: prompt)
    captured = {}

    def fake_complete(**kwargs):
        captured.update(kwargs)
        return crosscheck.NliResult(relation="contradicts", confidence=0.9, explanation="Opposite values")

    monkeypatch.setattr(crosscheck, "complete_structured", fake_complete)
    result = crosscheck._nli_judgment(RUN_ID, "claim A", "claim B")
    assert result.relation == "contradicts"
    assert captured["task"] == "crosscheck_nli"
    assert captured["messages"][1]["content"] == "A=claim A; B=claim B"


def test_age_days_uses_published_date_then_observed_date():
    today = datetime.now(tz=UTC).date()
    assert crosscheck._age_days(today - timedelta(days=12), today) == 12
    assert crosscheck._age_days(None, today - timedelta(days=5)) == 5
    assert crosscheck._age_days(None, None) is None


def test_load_evidence_executes_run_scoped_query():
    cursor = Mock()
    cursor.fetchall.return_value = [{"id": "e1"}]
    assert crosscheck._load_evidence(cursor, RUN_UUID) == [{"id": "e1"}]
    assert "WHERE e.run_id = %s" in cursor.execute.call_args.args[0]


def test_persist_claims_derives_status_and_links_evidence(monkeypatch):
    cursor = Mock()
    cursor.rowcount = 1
    rows = [
        evidence_row(embedding=[1.0, 0.0], publisher="publisher one"),
        evidence_row(
            evidence_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            embedding=[0.99, 0.01],
            publisher="PUBLISHER ONE",
        ),
    ]
    derived = []

    def fake_derive(origin, refs, **kwargs):
        derived.append((origin, refs, kwargs))
        return ClaimStatus.DIRECTIONAL

    monkeypatch.setattr(crosscheck, "derive_claim_status", fake_derive)
    monkeypatch.setattr(
        crosscheck,
        "_nli_judgment",
        lambda *_: crosscheck.NliResult(relation="same", confidence=0.95, explanation="Quote supports claim"),
    )
    counts = crosscheck._persist_claims(cursor, RUN_UUID, UUID("11111111-1111-4111-8111-111111111111"), [rows])
    assert counts == (1, 2, 0)
    assert derived[0][0] == "evidence"
    assert len({ref.publisher for ref in derived[0][1]}) == 1
    assert all("ON CONFLICT" in call.args[0] for call in cursor.execute.call_args_list)


def test_persist_claims_records_high_confidence_contradictions(monkeypatch):
    cursor = Mock()
    cursor.rowcount = 1
    first = evidence_row(embedding=[1.0, 0.0], claim_text="Revenue increased")
    second = evidence_row(
        evidence_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        embedding=[0.99, 0.01],
        claim_text="Revenue decreased",
    )
    third = evidence_row(
        evidence_id="cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        embedding=[0.0, 1.0],
        claim_text="Customer churn is low",
    )
    # Two separate clusters with similar vectors trigger the NLI pair check.
    second["embedding"] = [0.99, 0.01]
    third["embedding"] = [0.98, 0.02]
    monkeypatch.setattr(crosscheck, "_cluster_rows", lambda rows: [[first], [second]])
    monkeypatch.setattr(
        crosscheck,
        "_nli_judgment",
        lambda *_: crosscheck.NliResult(
            relation="contradicts", confidence=0.95, explanation="Opposite directions"
        ),
    )
    monkeypatch.setattr(crosscheck, "derive_claim_status", lambda *_args, **_kwargs: ClaimStatus.CONFLICTING)
    counts = crosscheck._persist_claims(
        cursor,
        RUN_UUID,
        UUID("11111111-1111-4111-8111-111111111111"),
        [[first], [second]],
    )
    assert counts == (2, 2, 1)
    assert any("claim_contradictions" in call.args[0] for call in cursor.execute.call_args_list)


def test_persist_claims_ignores_low_confidence_contradiction(monkeypatch):
    cursor = Mock()
    cursor.rowcount = 1
    first = evidence_row(embedding=[1.0, 0.0], claim_text="Revenue increased")
    second = evidence_row(
        evidence_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        embedding=[0.99, 0.01],
        claim_text="Revenue decreased",
    )
    monkeypatch.setattr(
        crosscheck,
        "_nli_judgment",
        lambda *_: crosscheck.NliResult(relation="contradicts", confidence=0.4, explanation="weak"),
    )
    monkeypatch.setattr(crosscheck, "derive_claim_status", lambda *_args, **_kwargs: ClaimStatus.DIRECTIONAL)
    counts = crosscheck._persist_claims(
        cursor,
        RUN_UUID,
        UUID("11111111-1111-4111-8111-111111111111"),
        [[first], [second]],
    )
    assert counts == (2, 2, 0)
    assert not any("claim_contradictions" in call.args[0] for call in cursor.execute.call_args_list)


def test_run_without_fetch_results_publishes_no_evidence_without_database(monkeypatch):
    monkeypatch.setattr(crosscheck.psycopg, "connect", lambda *_args, **_kwargs: pytest.fail("no DB expected"))
    ctx = SimpleNamespace(run_id=RUN_ID, publish=Mock())
    crosscheck.run(ctx)
    ctx.publish.assert_called_once_with(
        {"type": "stage.progress", "stage": "crosscheck", "note": "no_evidence", "claims": 0}
    )


def test_run_rejects_invalid_run_id_when_fetch_results_exist():
    ctx = SimpleNamespace(run_id="not-a-uuid", fetch_results=[object()], publish=Mock())
    with pytest.raises(ValueError, match="Invalid research run ID"):
        crosscheck.run(ctx)
