"""Tests for the deterministic verbatim gate (``fi_ai.evidence.verbatim``).

The gate accepts a quote only when it is a substring of the source snapshot
after whitespace normalization. No fuzzy matching, embeddings, or LLM
judgment is involved.
"""

import pytest

from fi_ai.evidence.verbatim import (
    VerbatimRejectionError,
    is_verbatim_quote,
    normalize,
    verify_quote,
)


def test_normalize_collapses_spaces():
    assert normalize("a   b") == "a b"


def test_normalize_collapses_newlines_crlf_and_tabs():
    assert normalize("a\r\nb\tc\nd") == "a b c d"


def test_normalize_trims_leading_and_trailing_whitespace():
    assert normalize("  \t  hello world  \n") == "hello world"


def test_normalize_mixed_whitespace_runs():
    assert normalize("a \n \t b") == "a b"


# --- accept ---------------------------------------------------------------


def test_exact_quote_accepted():
    snapshot = "Acme launched its new platform in 2024."
    assert is_verbatim_quote(snapshot, "Acme launched its new platform in 2024.") is True
    assert verify_quote(snapshot, "Acme launched its new platform in 2024.") == "Acme launched its new platform in 2024."


def test_quote_spanning_newline_accepted_after_normalization():
    snapshot = "Revenue was\n$10 million in 2025."
    assert is_verbatim_quote(snapshot, "Revenue was $10 million in 2025.") is True


def test_multiple_whitespace_normalization_accepted():
    snapshot = "The   market\tgrew  20%."
    assert is_verbatim_quote(snapshot, "The market grew 20%.") is True


def test_leading_trailing_whitespace_handled():
    snapshot = "  The market grew 20%.  "
    assert is_verbatim_quote(snapshot, "The market grew 20%.") is True
    assert is_verbatim_quote(snapshot, "  The market grew 20%.  ") is True


# --- reject ---------------------------------------------------------------


def test_paraphrase_rejected():
    snapshot = "The market grew 20% year over year."
    assert is_verbatim_quote(snapshot, "The market increased by twenty percent.") is False


def test_fabricated_quote_rejected():
    snapshot = "Acme launched in 2024."
    assert is_verbatim_quote(snapshot, "Acme launched in 2025.") is False


def test_partial_quote_with_extra_unsupported_words_rejected():
    snapshot = "Acme launched in 2024."
    assert is_verbatim_quote(snapshot, "Acme launched its platform in 2024.") is False


def test_empty_quote_rejected():
    assert is_verbatim_quote("anything", "") is False
    assert is_verbatim_quote("anything", "   ") is False
    assert is_verbatim_quote("anything", "\t\n") is False


def test_missing_snapshot_rejected():
    assert is_verbatim_quote(None, "any quote") is False


def test_incorrect_snapshot_source_pairing_rejected():
    assert (
        is_verbatim_quote("Acme launched in 2024.", "Beta Corp filed its 10-K in March.")
        is False
    )


def test_verify_quote_raises_descriptive_reason():
    with pytest.raises(VerbatimRejectionError, match="missing snapshot"):
        verify_quote(None, "x")
    with pytest.raises(VerbatimRejectionError, match="empty or whitespace-only"):
        verify_quote("snapshot", "")
    with pytest.raises(VerbatimRejectionError, match="substring"):
        verify_quote("snapshot", "fabricated quote")
