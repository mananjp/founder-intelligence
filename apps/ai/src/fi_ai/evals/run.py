"""Deterministic golden evaluation runner.

Run with:

    python -m fi_ai.evals.run --suite golden

The first version of the harness evaluates deterministic golden fixtures.
It does not make external LLM calls.

Metrics defined by the project Bible:

- unsupported_claim_rate
- quote_verbatim_rate
- citation_validity_rate
- contradiction_recall
- cost_per_run_usd
- latency_p50_ms
- latency_p95_ms
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# run.py:
# repository/
#   apps/ai/src/fi_ai/evals/run.py
#
# parents[5] points to the repository root.
REPOSITORY_ROOT = Path(__file__).resolve().parents[5]

GOLDEN_ROOT = REPOSITORY_ROOT / "evals" / "golden"


@dataclass
class CaseResult:
    """Result produced by evaluating one golden case."""

    case_id: str
    passed: bool
    checks: dict[str, bool]
    error: str | None = None


def load_json(path: Path) -> dict[str, Any]:
    """Load and validate one golden JSON case."""
    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)

    if not isinstance(data, dict):
        raise TypeError(f"Golden case must be a JSON object: {path}")

    return data


def evaluate_case(path: Path) -> CaseResult:
    """Evaluate one deterministic golden extraction case."""
    try:
        case = load_json(path)
    except (OSError, json.JSONDecodeError, ValueError , TypeError) as exc:
        return CaseResult(
            case_id=path.stem,
            passed=False,
            checks={},
            error=str(exc),
        )

    case_id = str(case.get("id", path.stem))
    document = case.get("document", "")
    expected = case.get("expected", {})

    if not isinstance(document, str):
        return CaseResult(
            case_id=case_id,
            passed=False,
            checks={},
            error="document must be a string",
        )

    if not isinstance(expected, dict):
        return CaseResult(
            case_id=case_id,
            passed=False,
            checks={},
            error="expected must be an object",
        )

    checks: dict[str, bool] = {}

    expected_relevant = bool(
        expected.get("has_relevant_evidence", False)
    )

    if expected_relevant:
        expected_quote = expected.get("quote")

        if not isinstance(expected_quote, str) or not expected_quote:
            return CaseResult(
                case_id=case_id,
                passed=False,
                checks={},
                error=(
                    "Relevant golden cases must provide a non-empty "
                    "expected.quote"
                ),
            )

        # The golden quote must occur exactly in the source document.
        checks["quote_verbatim"] = expected_quote in document

        expected_stance = expected.get("stance")

        if expected_stance is not None:
            checks["stance_valid"] = expected_stance in {
                "supports",
                "contradicts",
                "neutral",
            }

    else:
        expected_count = expected.get("evidence_count", 0)

        checks["no_relevant_evidence"] = expected_count == 0

    passed = all(checks.values()) if checks else False

    return CaseResult(
        case_id=case_id,
        passed=passed,
        checks=checks,
    )


def discover_cases(suite: str) -> list[Path]:
    """Discover JSON golden cases belonging to a suite."""
    if suite == "golden":
        root = GOLDEN_ROOT
    else:
        root = GOLDEN_ROOT / suite

    if not root.exists():
        raise FileNotFoundError(
            f"Golden suite not found: {root}"
        )

    cases = sorted(root.rglob("*.json"))

    if not cases:
        raise FileNotFoundError(
            f"No golden cases found in: {root}"
        )

    return cases


def calculate_metrics(
    results: list[CaseResult],
) -> dict[str, float | None]:
    """Calculate metrics supported by the deterministic harness.

    Some Bible metrics require actual research/model output and therefore
    cannot be honestly measured by fixture validation alone.
    """

    quote_results = [
        result.checks["quote_verbatim"]
        for result in results
        if "quote_verbatim" in result.checks
    ]

    if quote_results:
        quote_verbatim_rate = (
            sum(quote_results) / len(quote_results)
        )
    else:
        quote_verbatim_rate = None

    return {
        # These require actual generated claims/evidence/citations.
        "unsupported_claim_rate": None,
        "citation_validity_rate": None,
        "contradiction_recall": None,

        # This one can be checked deterministically against the snapshot
        # contained in the golden fixture.
        "quote_verbatim_rate": quote_verbatim_rate,
    }


def build_report(
    suite: str,
    results: list[CaseResult],
    elapsed_seconds: float,
) -> dict[str, Any]:
    """Build the structured evaluation report."""
    passed = sum(result.passed for result in results)
    failed = len(results) - passed

    return {
        "suite": suite,
        "status": "passed" if failed == 0 else "failed",
        "cases": {
            "total": len(results),
            "passed": passed,
            "failed": failed,
        },
        "metrics": calculate_metrics(results),
        "runtime": {
            "cost_per_run_usd": None,
            "latency_p50_ms": None,
            "latency_p95_ms": None,
            "harness_elapsed_ms": round(
                elapsed_seconds * 1000,
                3,
            ),
        },
        "results": [
            {
                "case_id": result.case_id,
                "passed": result.passed,
                "checks": result.checks,
                "error": result.error,
            }
            for result in results
        ],
    }


def main() -> int:
    """Run the requested evaluation suite."""
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--suite",
        default="golden",
    )

    parser.add_argument(
        "--fail-under-config",
        action="store_true",
    )

    args = parser.parse_args()

    started_at = time.perf_counter()

    try:
        case_paths = discover_cases(args.suite)

        results = [
            evaluate_case(path)
            for path in case_paths
        ]

        elapsed_seconds = (
            time.perf_counter() - started_at
        )

        report = build_report(
            args.suite,
            results,
            elapsed_seconds,
        )

        report_path = Path.cwd() / "eval-report.json"

        report_path.write_text(
            json.dumps(
                report,
                indent=2,
            ),
            encoding="utf-8",
        )

        print(
            json.dumps(
                report,
                indent=2,
            )
        )

        if (
            args.fail_under_config
            and report["status"] != "passed"
        ):
            return 1

        return 0

    except (
        FileNotFoundError,
        ValueError,
        json.JSONDecodeError,
    ) as exc:
        print(
            f"eval error: {exc}",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())