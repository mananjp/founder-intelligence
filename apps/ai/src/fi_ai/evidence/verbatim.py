"""Deterministic verbatim-quote validation gate for extracted evidence.

A quote is valid only when it is a verbatim substring of the source snapshot after
whitespace normalization. Paraphrases, partially invented text, reordered or
non-contiguous quotes are rejected.

The gate is pure and deterministic: it relies on exact substring matching over
whitespace-normalized text only. No embeddings, fuzzy matching, semantic similarity
or LLM judgment take part, so a passing check can never be influenced by a model.

Normalization contract
----------------------
* Consecutive whitespace runs (spaces, tabs, newlines, ...) collapse to a single
  space.
* Surrounding whitespace is trimmed.
* No other transformation is applied: punctuation, casing, word order and every
  other character are preserved exactly as written.

A candidate quote therefore passes when its normalized form occurs contiguously
within the normalized source snapshot.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class VerbatimCheck:
    """Outcome of validating one candidate quote against its source snapshot."""

    passed: bool
    normalized_quote: str = ""
    reasons: list[str] = field(default_factory=list)


def normalize_whitespace(text: str) -> str:
    """Collapse consecutive whitespace to a single space and trim surrounding whitespace.

    Only whitespace is normalized; punctuation, casing, words and their order are
    left untouched. Non-string input normalizes to the empty string.
    """
    if not isinstance(text, str):
        return ""
    return " ".join(text.split())


def check_verbatim(quote: str, source: str) -> VerbatimCheck:
    """Validate that ``quote`` is a verbatim substring of ``source`` after normalization."""
    normalized_quote = normalize_whitespace(quote)
    normalized_source = normalize_whitespace(source)

    if not normalized_quote:
        return VerbatimCheck(passed=False, normalized_quote=normalized_quote, reasons=["empty quote"])
    if not normalized_source:
        return VerbatimCheck(
            passed=False, normalized_quote=normalized_quote, reasons=["empty source snapshot"]
        )
    if normalized_quote not in normalized_source:
        return VerbatimCheck(
            passed=False,
            normalized_quote=normalized_quote,
            reasons=["quote is not a verbatim substring of the source snapshot"],
        )

    return VerbatimCheck(passed=True, normalized_quote=normalized_quote, reasons=[])


def is_verbatim(quote: str, source: str) -> bool:
    """Deterministic hard gate: quote must be an exact (whitespace-normalized) substring of source."""
    return check_verbatim(quote, source).passed
