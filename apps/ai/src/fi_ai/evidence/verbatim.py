"""Deterministic verbatim gate for extracted evidence quotes.

A quote is acceptable only when it appears verbatim in the source snapshot
that was used for extraction, *after whitespace normalization*. No fuzzy
matching, semantic similarity, embeddings, or LLM judgment is involved:

    normalize(snapshot).find(normalize(quote)) != -1

Normalization collapses every run of whitespace -- spaces, tabs, CRLF and
newlines -- into a single space and trims leading/trailing whitespace.
"""

from __future__ import annotations

__all__ = [
    "VerbatimRejectionError",
    "is_verbatim_quote",
    "normalize",
    "verify_quote",
]


class VerbatimRejectionError(ValueError):
    """Raised when a quote fails the verbatim gate."""


def normalize(text: str) -> str:
    """Collapse runs of whitespace into a single space and trim the ends.

    ``str.split()`` without arguments splits on runs of Unicode whitespace
    (spaces, tabs, ``\\r``, ``\\n``, ``\\f``, ``\\v``) and drops empty pieces,
    so joining with a single space is exactly "collapse runs, trim ends".
    """
    return " ".join(text.split())


def is_verbatim_quote(snapshot: str | None, quote: str) -> bool:
    """Return True iff *quote* is a verbatim substring of *snapshot*.

    Rejects a missing snapshot, an empty or whitespace-only quote, a
    paraphrase, a fabricated quote, and any quote carrying extra wording
    that is not supported by the snapshot. Both sides are normalized
    identically before the substring check.
    """
    if snapshot is None:
        return False
    if not quote or not quote.strip():
        return False
    return normalize(quote) in normalize(snapshot)


def verify_quote(snapshot: str | None, quote: str) -> str:
    """Return the normalized quote when it passes the gate.

    Raises ``VerbatimRejectionError`` with a descriptive reason otherwise,
    so callers cannot confuse "invalid" with "missing".
    """
    if snapshot is None:
        raise VerbatimRejectionError("missing snapshot: cannot verify quote")
    if not quote or not quote.strip():
        raise VerbatimRejectionError("empty or whitespace-only quote")
    normalized_quote = normalize(quote)
    normalized_snapshot = normalize(snapshot)
    if normalized_quote not in normalized_snapshot:
        raise VerbatimRejectionError(
            "quote is not a verbatim substring of the source snapshot after "
            "whitespace normalization"
        )
    return normalized_quote
