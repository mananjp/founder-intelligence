from fi_ai.evidence.verbatim import check_verbatim, is_verbatim, normalize_whitespace


def test_normalize_whitespace_collapses_runs_and_trims():
    assert normalize_whitespace("  Acme   launched \n  its platform  ") == "Acme launched its platform"


def test_normalize_whitespace_preserves_punctuation_and_case():
    assert normalize_whitespace("The platform, v2.0, is live") == "The platform, v2.0, is live"


def test_normalize_whitespace_handles_non_string_input():
    assert normalize_whitespace(None) == ""  # type: ignore[arg-type]
    assert normalize_whitespace(123) == ""  # type: ignore[arg-type]


def test_exact_quote_matches_source():
    source = "Acme launched its new platform in 2024. The platform is designed for small businesses."

    assert is_verbatim("Acme launched its new platform in 2024.", source) is True


def test_quote_with_different_whitespace_that_normalizes_identically_is_valid():
    source = "Acme launched its new platform in 2024."

    assert is_verbatim("Acme launched \n its new platform in 2024.  ", source) is True


def test_paraphrased_quote_is_rejected():
    source = "Acme launched its new platform in 2024."

    assert is_verbatim("Acme launched its new platform back in 2024.", source) is False


def test_quote_with_altered_word_is_rejected():
    source = "Acme launched its new platform in 2024."

    assert is_verbatim("Acme launched its new platform back in 2025.", source) is False


def test_quote_with_changed_punctuation_is_rejected():
    source = "Acme's platform launched in 2024."

    assert is_verbatim("Acme platform launched in 2024.", source) is False
    assert is_verbatim("Acme’s platform launched in 2024.", source) is False


def test_reordered_or_non_contiguous_quote_is_rejected():
    source = "Acme launched its new platform in 2024. The platform is designed for small businesses."

    assert (
        is_verbatim(
            "The platform is designed for small businesses. Acme launched its new platform in 2024.", source
        )
        is False
    )


def test_empty_quote_is_rejected():
    assert is_verbatim("", "Acme launched its new platform in 2024.") is False
    assert is_verbatim("     ", "Acme launched its new platform in 2024.") is False


def test_empty_snapshot_is_rejected():
    assert is_verbatim("Acme launched its new platform in 2024.", "") is False
    assert is_verbatim("Acme launched its new platform in 2024.", "   \n\t  ") is False


def test_quote_that_appears_only_in_a_different_snapshot_is_rejected():
    assert (
        is_verbatim(
            "Acme launched its new platform in 2024.", "Global competitors shipped similar tooling in 2025."
        )
        is False
    )


def test_check_verbatim_reports_reason_for_invalid_quote():
    check = check_verbatim(
        "Acme launched its new platform back in 2024.", "Acme launched its new platform in 2024."
    )

    assert check.passed is False
    assert check.normalized_quote == "Acme launched its new platform back in 2024."
    assert check.reasons


def test_check_verbatim_passes_with_empty_reasons():
    check = check_verbatim(
        "Acme launched its new platform in 2024.", "Acme launched its new platform in 2024."
    )

    assert check.passed is True
    assert check.reasons == []
    assert check.normalized_quote == "Acme launched its new platform in 2024."
