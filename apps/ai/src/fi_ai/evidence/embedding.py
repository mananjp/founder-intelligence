"""Embedding generation for validated evidence quotes.

Embeddings are produced through the existing LLM provider routing (task -> tier ->
model from ``fi_ai/llm/models.yaml``) and stored on the ``evidence.embedding`` column
(``vector(1536)``, see ``db/migrations/002_research_pipeline.sql``).

Generation is deliberately downstream of the verbatim validation gate: only quotes
that passed :func:`fi_ai.evidence.verbatim.check_verbatim` ever reach this module, so
rejected (paraphrased / invented / reordered) quotes can never acquire an embedding.
"""

from __future__ import annotations

from collections.abc import Sequence

from fi_ai.llm.router import model_for

EMBEDDING_DIMENSIONS = 1536


def _default_embed(model: str, texts: list[str]) -> list[list[float]]:
    """Call the provider embedding API for *texts* and return one vector per text."""
    import litellm  # local import keeps the module importable without the provider SDK

    response = litellm.embedding(model=model, input=texts)
    data = list(getattr(response, "data", None) or [])
    vectors: list[list[float]] = []
    for item in data:
        vector = getattr(item, "embedding", None)
        if vector is None and isinstance(item, (list, tuple)):
            vector = item
        vectors.append([float(value) for value in vector] if vector is not None else [])
    return vectors


def _embed_texts(task: str, texts: list[str]) -> list[list[float]]:
    return _default_embed(model_for(task), texts)


def embed_texts(texts: Sequence[str], *, task: str = "embed_texts") -> list[list[float]]:
    """Embed each text with the provider tier routed for ``task``.

    Returns one embedding per text, in order. Raises ``ValueError`` when the provider
    returns an unexpected number of vectors or vectors with unexpected dimensions.
    """
    if not texts:
        return []
    vectors = _embed_texts(task, list(texts))
    if len(vectors) != len(texts):
        raise ValueError(f"embedding provider returned {len(vectors)} vectors for {len(texts)} texts")
    for vector in vectors:
        if len(vector) != EMBEDDING_DIMENSIONS:
            raise ValueError(
                f"embedding dimension mismatch: expected {EMBEDDING_DIMENSIONS}, got {len(vector)}"
            )
    return vectors


def embed_quote(quote: str, *, task: str = "embed_texts") -> list[float]:
    """Embed a single validated evidence quote and return its vector.

    ``embed_texts`` always returns exactly one vector for one input text (or raises),
    so the first vector is safe to return directly.
    """
    return embed_texts([quote], task=task)[0]
