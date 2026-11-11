"""Tests for ``quote_verbatim_rate`` and the evaluation report.

The metric is computed from actual verbatim-gate outcomes, never from
model-reported values:

    quote_verbatim_rate = accepted_verbatim_quotes / total_non_empty_quotes_evaluated

Empty datasets yield a missing metric (None), never 1.0, and a missing
metric fails the evaluation closed.
"""

import json
from pathlib import Path

from fi_ai.evals.run import CaseResult, build_report, calculate_metrics, discover_cases, evaluate_case
from fi_ai.evidence.verbatim import is_verbatim_quote
from fi_ai.metrics import quote_verbatim_rate, record_quote_verbatim_rate

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


# --- metric helper --------------------------------------------------------


def test_quote_verbatim_rate_perfect():
    assert quote_verbatim_rate(accepted=4, evaluated=4) == 1.0


def test_quote_verbatim_rate_one_invalid_lowers_score():
    assert quote_verbatim_rate(accepted=3, evaluated=4) == 0.75


def test_quote_verbatim_rate_all_invalid_is_zero():
    assert quote_verbatim_rate(accepted=0, evaluated=4) == 0.0


def test_quote_verbatim_rate_empty_is_none_never_one():
    assert quote_verbatim_rate(accepted=0, evaluated=0) is None


def test_calculate_metrics_empty_dataset_is_none():
    metrics = calculate_metrics([])
    assert metrics["quote_verbatim_rate"] is None


def test_record_quote_verbatim_rate_updates_counters():
    record_quote_verbatim_rate(accepted=3, evaluated=4, stage="extract")
    rate = quote_verbatim_rate(accepted=3, evaluated=4)
    assert rate == 0.75


# --- evaluation uses the real gate, not model-reported values ------------


def test_evaluate_case_uses_normalized_verbatim_match():
    """Newline/space differences are normalized: verbatim after normalization."""
    case = {
        "id": "norm-case",
        "document": "Revenue was\n$10 million in 2025.",
        "expected": {
            "has_relevant_evidence": True,
            "quote": "Revenue was $10 million in 2025.",
            "stance": "supports",
        },
    }
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "case.json"
        path.write_text(json.dumps(case), encoding="utf-8")
        result = evaluate_case(path)
    assert result.passed is True
    assert result.checks["quote_verbatim"] is True
    assert is_verbatim_quote(case["document"], case["expected"]["quote"]) is True


def test_evaluate_case_rejects_paraphrase_quote():
    case = {
        "id": "para-case",
        "document": "The market grew 20% year over year.",
        "expected": {
            "has_relevant_evidence": True,
            "quote": "The market increased by twenty percent.",
            "stance": "supports",
        },
    }
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "case.json"
        path.write_text(json.dumps(case), encoding="utf-8")
        result = evaluate_case(path)
    assert result.passed is False
    assert result.checks["quote_verbatim"] is False


# --- report thresholds -----------------------------------------------------


def _results(*, verbatim_flags):
    return [
        CaseResult(case_id=f"c{i}", passed=flag, checks={"quote_verbatim": flag})
        for i, flag in enumerate(verbatim_flags)
    ]


def test_build_report_all_valid_passes_at_golden_target():
    report = build_report("t", _results(verbatim_flags=[True, True]), 0.1)
    assert report["status"] == "passed"
    assert report["metrics"]["quote_verbatim_rate"] == 1.0


def test_build_report_one_invalid_fails_below_target():
    report = build_report("t", _results(verbatim_flags=[True, False]), 0.1)
    assert report["status"] == "failed"
    assert report["metrics"]["quote_verbatim_rate"] == 0.5
    assert any("quote_verbatim_rate" in v for v in report["threshold_violations"])


def test_build_report_all_invalid_is_zero_and_fails():
    report = build_report("t", _results(verbatim_flags=[False, False]), 0.1)
    assert report["status"] == "failed"
    assert report["metrics"]["quote_verbatim_rate"] == 0.0


def test_build_report_empty_dataset_fails_closed():
    """No quotes evaluated -> metric missing -> fail closed, never 1.0."""
    report = build_report("t", [CaseResult(case_id="c1", passed=True, checks={})], 0.1)
    assert report["status"] == "failed"
    assert report["metrics"]["quote_verbatim_rate"] is None
    assert any("quote_verbatim_rate" in v and "missing" in v for v in report["threshold_violations"])


def test_golden_extraction_suite_achieves_exactly_100_percent():
    """The golden extraction fixture must achieve the 1.0 verbatim target."""
    cases = discover_cases("extraction")
    assert cases, "extraction suite must not be empty"
    results = [evaluate_case(path) for path in cases]
    metrics = calculate_metrics(results)
    assert metrics["quote_verbatim_rate"] == 1.0
    report = build_report("extraction", results, 0.1)
    assert report["status"] == "passed"
    assert report["metrics"]["quote_verbatim_rate"] == 1.0
    assert report["threshold_violations"] == []
