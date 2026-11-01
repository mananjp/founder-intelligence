import sys
import types
from typing import Any

import pytest

from fi_ai.evidence.embedding import EMBEDDING_DIMENSIONS, _default_embed, embed_quote, embed_texts


def test_embed_texts_returns_one_vector_per_text(monkeypatch):
    monkeypatch.setattr(
        "fi_ai.evidence.embedding._default_embed",
        lambda model, texts: [[0.1] * EMBEDDING_DIMENSIONS for _ in texts],
    )

    vectors = embed_texts(["Acme grew revenue.", "Acme grew revenue."])

    assert len(vectors) == 2
    assert all(vector == [0.1] * EMBEDDING_DIMENSIONS for vector in vectors)


def test_embed_texts_returns_empty_list_for_no_texts(monkeypatch):
    monkeypatch.setattr("fi_ai.evidence.embedding._default_embed", lambda model, texts: [])

    assert embed_texts([]) == []


def test_embed_texts_rejects_unexpected_vector_count(monkeypatch):
    monkeypatch.setattr(
        "fi_ai.evidence.embedding._default_embed",
        lambda model, texts: [[0.1] * EMBEDDING_DIMENSIONS],
    )

    with pytest.raises(ValueError, match="returned 1 vectors for 2 texts"):
        embed_texts(["one", "two"])


def test_embed_texts_rejects_wrong_dimension(monkeypatch):
    monkeypatch.setattr(
        "fi_ai.evidence.embedding._default_embed",
        lambda model, texts: [[0.1, 0.2] for _ in texts],
    )

    with pytest.raises(ValueError, match="embedding dimension mismatch"):
        embed_texts(["one"])


def test_embed_quote_returns_single_vector(monkeypatch):
    monkeypatch.setattr(
        "fi_ai.evidence.embedding._default_embed",
        lambda model, texts: [[0.25] * EMBEDDING_DIMENSIONS],
    )

    assert embed_quote("Acme grew revenue.") == [0.25] * EMBEDDING_DIMENSIONS


class _FakeEmbeddingItem:
    def __init__(self, embedding: Any) -> None:
        self.embedding = embedding


class _FakeEmbeddingResponse:
    def __init__(self, data: list[Any]) -> None:
        self.data = data


def test_default_embed_parses_provider_response(monkeypatch):
    expected = [0.1] * EMBEDDING_DIMENSIONS
    fake_litellm = types.ModuleType("litellm")
    fake_litellm.embedding = lambda model, input: _FakeEmbeddingResponse(  # type: ignore[attr-defined]
        [
            _FakeEmbeddingItem(expected),
            [0.2] * EMBEDDING_DIMENSIONS,  # raw list item
            _FakeEmbeddingItem(None),  # missing vector -> empty placeholder
        ]
    )
    monkeypatch.setitem(sys.modules, "litellm", fake_litellm)

    vectors = _default_embed("fake-model", ["a", "b", "c"])

    assert vectors == [expected, [0.2] * EMBEDDING_DIMENSIONS, []]
