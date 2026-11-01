import json
import runpy
import sys
from pathlib import Path

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
GOLDEN_ROOT = REPOSITORY_ROOT / "evals" / "golden"


def test_discover_golden_cases():
    from fi_ai.evals.run import discover_cases

    cases = discover_cases("golden")

    assert len(cases) >= 40
    assert all(path.suffix == ".json" for path in cases)


@pytest.mark.parametrize(
    "suite_name",
    ["scope", "plan", "crosscheck", "interview", "extraction"],
)
def test_discover_suite_cases_minimum_eight(suite_name: str):
    from fi_ai.evals.run import discover_cases

    cases = discover_cases(suite_name)
    assert len(cases) >= 8
    assert all(path.suffix == ".json" for path in cases)


@pytest.mark.parametrize(
    "suite_name",
    ["scope", "plan", "crosscheck", "interview", "extraction"],
)
def test_suite_has_contradiction_and_irrelevant(suite_name: str):
    from fi_ai.evals.run import discover_cases, evaluate_case

    cases = discover_cases(suite_name)
    results = [evaluate_case(p) for p in cases]

    assert all(r.passed for r in results)

    # Must contain at least one seeded contradiction
    has_contradiction = any(
        r.checks.get("contradiction_detected") is True or r.checks.get("stance_valid") is True
        for p, r in zip(cases, results, strict=False)
        if "contradict" in p.read_text(encoding="utf-8")
    )
    assert has_contradiction, f"Suite {suite_name} must contain a seeded contradiction"

    # Must contain at least one irrelevant-document case (no_relevant_evidence == True)
    has_irrelevant = any(r.checks.get("no_relevant_evidence") is True for r in results)
    assert has_irrelevant, f"Suite {suite_name} must contain an irrelevant-document case"


def test_crosscheck_asserts_real_stage_output():
    """Verify crosscheck suite exercises derive_claim_status pipeline stage."""
    from fi_ai.evals.run import evaluate_case

    path = GOLDEN_ROOT / "crosscheck" / "crosscheck_verified_primary.json"
    result = evaluate_case(path)

    assert result.passed is True
    assert result.checks["status_match"] is True
    assert result.checks["contradiction_detected"] is True

    path_contra = GOLDEN_ROOT / "crosscheck" / "crosscheck_contradiction_pricing.json"
    result_contra = evaluate_case(path_contra)

    assert result_contra.passed is True
    assert result_contra.checks["status_match"] is True
    assert result_contra.checks["contradiction_detected"] is True


def test_missing_evidence_count_raises_error(tmp_path):
    """Missing evidence_count in irrelevant case must produce an explicit error."""
    from fi_ai.evals.run import evaluate_case

    bad_case = tmp_path / "bad.json"
    bad_case.write_text(
        json.dumps(
            {
                "id": "bad-case-001",
                "document": "Some text",
                "expected": {
                    "has_relevant_evidence": False
                    # missing evidence_count
                },
            }
        ),
        encoding="utf-8",
    )

    result = evaluate_case(bad_case)
    assert result.passed is False
    assert "explicitly provide expected.evidence_count" in (result.error or "")


def test_calculate_metrics_values():
    from fi_ai.evals.run import CaseResult, calculate_metrics

    # Perfect verbatim + contradiction recall
    perfect_results = [
        CaseResult(
            case_id="1",
            passed=True,
            checks={"quote_verbatim": True, "contradiction_detected": True},
        ),
        CaseResult(
            case_id="2",
            passed=True,
            checks={"quote_verbatim": True, "contradiction_detected": True},
        ),
    ]
    metrics = calculate_metrics(perfect_results)
    assert metrics["quote_verbatim_rate"] == 1.0
    assert metrics["unsupported_claim_rate"] == 0.0
    assert metrics["contradiction_recall"] == 1.0
    assert metrics["citation_validity_rate"] == 1.0

    # With non-verbatim quote
    flawed_results = [
        CaseResult(case_id="1", passed=True, checks={"quote_verbatim": True}),
        CaseResult(case_id="2", passed=False, checks={"quote_verbatim": False}),
    ]
    metrics_flawed = calculate_metrics(flawed_results)
    assert metrics_flawed["quote_verbatim_rate"] == 0.5
    assert metrics_flawed["unsupported_claim_rate"] == 0.5
    assert metrics_flawed["citation_validity_rate"] == 0.5


def test_build_report_threshold_failure():
    from fi_ai.evals.run import CaseResult, build_report

    # 1 failed out of 20 = 5% unsupported claim rate, 95% quote verbatim
    results = [
        CaseResult(case_id=f"c{i}", passed=True, checks={"quote_verbatim": True}) for i in range(19)
    ] + [
        CaseResult(case_id="c19", passed=False, checks={"quote_verbatim": False}),
    ]

    report = build_report("test", results, 0.1)
    assert report["status"] == "failed"
    assert len(report["threshold_violations"]) > 0
    assert any("unsupported_claim_rate" in v for v in report["threshold_violations"])
    assert any("quote_verbatim_rate" in v for v in report["threshold_violations"])


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
    assert report["cases"]["total"] >= 40
    assert report["cases"]["failed"] == 0
    assert report["metrics"]["unsupported_claim_rate"] == 0.0
    assert report["metrics"]["quote_verbatim_rate"] == 1.0
    assert report["metrics"]["contradiction_recall"] == 1.0
    assert report["metrics"]["citation_validity_rate"] == 1.0

    assert '"status": "passed"' in output
