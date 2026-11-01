import json
import runpy
import sys
from pathlib import Path

import pytest

from fi_ai.evals.run import (
    QUOTE_VERBATIM_TARGET,
    CaseResult,
    build_report,
    calculate_metrics,
    evaluate_case,
)

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
GOLDEN_ROOT = REPOSITORY_ROOT / "evals" / "golden" / "extraction"


def test_discover_golden_cases():
    from fi_ai.evals.run import discover_cases

    cases = discover_cases("golden")

    assert len(cases) >= 3
    assert all(path.suffix == ".json" for path in cases)


def test_basic_golden_case_passes():
    from fi_ai.evals.run import evaluate_case

    path = GOLDEN_ROOT / "basic.json"

    result = evaluate_case(path)

    assert result.passed is True
    assert result.checks["quote_verbatim"] is True


def test_irrelevant_golden_case_passes():
    from fi_ai.evals.run import evaluate_case

    path = GOLDEN_ROOT / "irrelevant.json"

    result = evaluate_case(path)

    assert result.passed is True
    assert result.checks["no_relevant_evidence"] is True


def test_contradiction_golden_case_passes():
    from fi_ai.evals.run import evaluate_case

    path = GOLDEN_ROOT / "contradiction.json"

    result = evaluate_case(path)

    assert result.passed is True
    assert result.checks["stance_valid"] is True


def test_eval_runner_creates_report(
    monkeypatch,
    capsys,
    tmp_path,
):
    monkeypatch.chdir(tmp_path)

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "fi_ai.evals.run",
            "--suite",
            "golden",
            "--fail-under-config",
        ],
    )

    with pytest.raises(SystemExit) as exc_info:
        runpy.run_module(
            "fi_ai.evals.run",
            run_name="__main__",
        )

    assert exc_info.value.code == 0

    output = capsys.readouterr().out

    report_path = tmp_path / "eval-report.json"

    assert report_path.exists()

    report = json.loads(
        report_path.read_text(
            encoding="utf-8",
        )
    )

    assert report["suite"] == "golden"
    assert report["status"] == "passed"
    assert report["cases"]["failed"] == 0

    assert '"status": "passed"' in output


# --- Sprint 2, WS4 (Issue #20): quote_verbatim_rate metric and score ---


def _result(checks: dict[str, bool], *, case_id: str = "case-1", passed: bool | None = None) -> CaseResult:
    return CaseResult(case_id=case_id, passed=True if passed is None else passed, checks=checks)


def test_all_valid_quotes_produce_verbatim_rate_of_100_percent():
    results = [
        _result({"quote_verbatim": True, "stance_valid": True}),
        _result({"quote_verbatim": True, "stance_valid": True}, case_id="case-2"),
    ]

    metrics = calculate_metrics(results)

    assert metrics["quote_verbatim_rate"] == 1.0
    assert metrics["quote_verbatim_rate"] >= QUOTE_VERBATIM_TARGET


def test_mixture_of_valid_and_invalid_quotes_produces_correct_rate():
    results = [
        _result({"quote_verbatim": True}),
        _result({"quote_verbatim": False}),
        _result({"quote_verbatim": True}),
    ]

    assert calculate_metrics(results)["quote_verbatim_rate"] == pytest.approx(2 / 3)


def test_all_invalid_quotes_produce_zero_verbatim_rate():
    results = [
        _result({"quote_verbatim": False}),
        _result({"quote_verbatim": False}, case_id="case-2"),
    ]

    assert calculate_metrics(results)["quote_verbatim_rate"] == 0.0


def test_empty_evaluation_set_follows_documented_convention_of_missing_rate():
    assert calculate_metrics([])["quote_verbatim_rate"] is None
    assert calculate_metrics([_result({"no_relevant_evidence": True})])["quote_verbatim_rate"] is None


def test_missing_quote_verbatim_metric_is_not_a_passing_score():
    report = build_report("golden", [], 0.0)

    quote_verbatim_rate = report["metrics"]["quote_verbatim_rate"]

    assert quote_verbatim_rate is None
    assert not (quote_verbatim_rate is not None and quote_verbatim_rate >= QUOTE_VERBATIM_TARGET)


def test_score_is_exposed_through_the_evaluation_report():
    results = [_result({"quote_verbatim": True})]

    report = build_report("golden", results, 0.01)

    assert report["metrics"]["quote_verbatim_rate"] == 1.0


def test_evaluate_case_rejects_quote_that_is_not_verbatim(tmp_path):
    path = tmp_path / "basic_paraphrased.json"
    case = {
        "id": "extraction-basic-002",
        "document": "Acme launched its new platform in 2024.",
        "expected": {
            "has_relevant_evidence": True,
            "claim_text": "Acme launched its new platform in 2024.",
            "quote": "Acme launched its new platform last year.",  # paraphrased -> invalid
            "stance": "supports",
        },
    }
    path.write_text(json.dumps(case), encoding="utf-8")

    result = evaluate_case(path)

    assert result.passed is False
    assert result.checks["quote_verbatim"] is False


def test_evaluate_case_accepts_quote_that_only_differs_in_whitespace(tmp_path):
    path = tmp_path / "basic_whitespace.json"
    case = {
        "id": "extraction-basic-003",
        "document": "Acme launched its new platform in 2024.",
        "expected": {
            "has_relevant_evidence": True,
            "claim_text": "Acme launched its new platform in 2024.",
            "quote": "  Acme   launched its new platform in 2024.  ",  # normalizes to the same text
            "stance": "supports",
        },
    }
    path.write_text(json.dumps(case), encoding="utf-8")

    result = evaluate_case(path)

    assert result.passed is True
    assert result.checks["quote_verbatim"] is True


def test_eval_runner_fails_when_quote_verbatim_rate_is_below_target(monkeypatch, tmp_path, capsys):
    from fi_ai.evals.run import main

    monkeypatch.setattr(
        "fi_ai.evals.run.discover_cases",
        lambda suite: [tmp_path / "case.json"],
    )
    monkeypatch.setattr(
        "fi_ai.evals.run.evaluate_case",
        lambda path: CaseResult(
            case_id="case-1",
            passed=False,
            checks={"quote_verbatim": False},
            error=None,
        ),
    )

    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "fi_ai.evals.run",
            "--suite",
            "golden",
            "--fail-under-config",
        ],
    )

    assert main() == 1


def test_eval_runner_passes_when_quote_verbatim_rate_meets_target(monkeypatch, tmp_path):
    from fi_ai.evals.run import main

    monkeypatch.setattr(
        "fi_ai.evals.run.discover_cases",
        lambda suite: [tmp_path / "case.json"],
    )
    monkeypatch.setattr(
        "fi_ai.evals.run.evaluate_case",
        lambda path: CaseResult(
            case_id="case-1",
            passed=True,
            checks={"quote_verbatim": True},
            error=None,
        ),
    )

    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "fi_ai.evals.run",
            "--suite",
            "golden",
            "--fail-under-config",
        ],
    )

    assert main() == 0
