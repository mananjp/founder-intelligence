"""Embedding generation for evidence that passes the verbatim gate.

Embeddings are produced with the configured embedding provider -- the
``embedding`` tier of ``fi_ai/llm/models.yaml`` (``${LLM_EMBED_MODEL}``) --
through a swappable backend seam, mirroring the pattern used by
``fi_ai.llm.router``. Missing configuration and provider failures are
handled explicitly: empty, fabricated or malformed vectors are never
returned, let alone stored.

Embedding generation is deliberately independent of quote verification:
``verify_quote`` never touches embeddings, and a quote's fate is decided
before any embedding is generated.
"""

from __future__ import annotations

from typing import Any

from fi_ai.llm.router import model_for

__all__ = [
    "EmbeddingError",
    "EmbeddingProviderError",
    "MissingEmbeddingConfigError",
    "embed_text",
    "reset_embedding_backend",
    "set_embedding_backend",
]


class EmbeddingError(Exception):
    """Base class for embedding failures."""


class MissingEmbeddingConfigError(EmbeddingError):
    """Raised when no embedding model is configured (env var not set)."""


class EmbeddingProviderError(EmbeddingError):
    """Raised when the embedding provider call fails or returns malformed output."""


def _default_embedding_backend(model: str, input: list[str]) -> Any:
    """Real provider call: liteLLM's embedding endpoint."""
    import litellm  # local import keeps the module importable without litellm

    return litellm.embedding(model=model, input=input)


# Module-level mutable backend seam, replaced by tests via set_embedding_backend.
_embedding_backend = _default_embedding_backend


def set_embedding_backend(fn: Any) -> None:
    """Replace the embedding backend (for testing)."""
    global _embedding_backend
    _embedding_backend = fn


def reset_embedding_backend() -> None:
    """Restore the real LiteLLM embedding backend."""
    global _embedding_backend
    _embedding_backend = _default_embedding_backend


def _extract_embedding(response: Any) -> list[float]:
    """Pull the first embedding vector out of a provider response.

    Raises ``EmbeddingProviderError`` on missing or malformed vectors so the
    caller can never store a fabricated, empty or malformed embedding.
    """
    try:
        data = response.data
    except AttributeError as exc:
        raise EmbeddingProviderError("embedding response has no 'data' field") from exc
    if not data:
        raise EmbeddingProviderError("embedding response returned no vectors")
    try:
        vector = data[0].embedding
    except AttributeError as exc:
        raise EmbeddingProviderError("embedding object has no 'embedding' field") from exc
    if (
        not isinstance(vector, list)
        or not vector
        or not all(isinstance(value, (int, float)) for value in vector)
    ):
        raise EmbeddingProviderError("malformed embedding vector")
    return [float(value) for value in vector]


def embed_text(text: str, *, model: str | None = None) -> list[float]:
    """Embed *text* with the configured embedding provider.

    *model* defaults to the ``embedding`` tier model from
    ``fi_ai/llm/models.yaml`` (env-var expanded, e.g. ``${LLM_EMBED_MODEL}``).

    Raises:
        ``MissingEmbeddingConfigError`` when no model is configured.
        ``EmbeddingProviderError`` on provider failure or malformed output.
        ``EmbeddingError`` when *text* is empty.
    """
    if not text or not text.strip():
        raise EmbeddingError("cannot embed empty text")

    model_name = model or model_for("embed_evidence")
    if not model_name.strip():
        raise MissingEmbeddingConfigError(
            "Embedding model is not configured: set LLM_EMBED_MODEL in your "
            "environment before generating embeddings."
        )

    try:
        response = _embedding_backend(model=model_name, input=[text])
    except EmbeddingError:
        raise
    except Exception as exc:  # provider failures are explicit
        raise EmbeddingProviderError(f"embedding provider failed: {exc}") from exc

    return _extract_embedding(response)
