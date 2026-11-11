"""Tests for evidence embedding generation (``fi_ai.evidence.embedding``).

The provider backend is swappable; tests use a fake backend and never call a
real embedding provider.
"""

import pytest

from fi_ai.evidence.embedding import (
    EmbeddingError,
    EmbeddingProviderError,
    MissingEmbeddingConfigError,
    embed_text,
    reset_embedding_backend,
    set_embedding_backend,
)


class _FakeEmbedding:
    """Fake provider response shaped like liteLLM's embedding response."""

    def __init__(self, vector):
        self._vector = vector
        self.calls = []

    def __call__(self, *, model, input, **kwargs):
        self.calls.append((model, list(input)))

        class _Vector:
            embedding = self._vector

        class _Response:
            def __init__(self) -> None:
                self.data = [_Vector()]

        return _Response()


def test_embed_text_calls_provider_with_configured_model(monkeypatch):
    monkeypatch.setenv("LLM_EMBED_MODEL", "fake-embed-model")
    fake = _FakeEmbedding([0.1, 0.2, 0.3])
    set_embedding_backend(fake)
    try:
        vector = embed_text("hello world")
        assert vector == [0.1, 0.2, 0.3]
        assert fake.calls == [("fake-embed-model", ["hello world"])]
    finally:
        reset_embedding_backend()
        monkeypatch.delenv("LLM_EMBED_MODEL", raising=False)


def test_embed_text_rejects_empty_text():
    fake = _FakeEmbedding([0.1])
    set_embedding_backend(fake)
    try:
        with pytest.raises(EmbeddingError, match="empty text"):
            embed_text("")
        with pytest.raises(EmbeddingError, match="empty text"):
            embed_text("   ")
        assert fake.calls == []  # provider never called
    finally:
        reset_embedding_backend()


def test_embed_text_missing_configuration_raises_explicitly(monkeypatch):
    monkeypatch.setenv("LLM_EMBED_MODEL", "")
    try:
        with pytest.raises(MissingEmbeddingConfigError, match="not configured"):
            embed_text("hello world")
    finally:
        reset_embedding_backend()


def test_embed_text_provider_failure_raises_explicitly(monkeypatch):
    monkeypatch.setenv("LLM_EMBED_MODEL", "fake-embed-model")

    def boom(*, model, input, **kwargs):
        raise ConnectionError("provider down")

    set_embedding_backend(boom)
    try:
        with pytest.raises(EmbeddingProviderError, match="provider down"):
            embed_text("hello world")
    finally:
        reset_embedding_backend()


def test_embed_text_malformed_vector_raises(monkeypatch):
    monkeypatch.setenv("LLM_EMBED_MODEL", "fake-embed-model")
    fake = _FakeEmbedding("not-a-vector")
    set_embedding_backend(fake)
    try:
        with pytest.raises(EmbeddingProviderError, match="malformed"):
            embed_text("hello world")
    finally:
        reset_embedding_backend()


def test_embed_text_empty_vector_raises(monkeypatch):
    monkeypatch.setenv("LLM_EMBED_MODEL", "fake-embed-model")
    fake = _FakeEmbedding([])
    set_embedding_backend(fake)
    try:
        with pytest.raises(EmbeddingProviderError, match="malformed"):
            embed_text("hello world")
    finally:
        reset_embedding_backend()


def test_embed_text_backend_is_reset_between_tests():
    """The backend seam must not leak fakes between tests."""
    set_embedding_backend(_FakeEmbedding([9.9]))
    reset_embedding_backend()
    # No env var -> missing config error from the real default path
    with pytest.raises(MissingEmbeddingConfigError):
        embed_text("hello world")
