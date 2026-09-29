import json
import runpy
import sys
from pathlib import Path

import pytest

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