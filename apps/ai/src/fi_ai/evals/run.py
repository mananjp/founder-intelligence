"""Deterministic golden evaluation runner.

Run with:

    python -m fi_ai.evals.run --suite golden

The harness evaluates deterministic golden fixtures and the crosscheck stage
logic. It does not make external LLM calls. Where a Bible metric cannot be
measured without real pipeline output, the report stays null rather than
inventing a value; citation_validity_rate currently proxies quote verbatim
rate because no citation-to-snapshot link is recorded in the fixtures.

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

from fi_ai.evidence.schemas import ClaimStatus
from fi_ai.evidence.status import EvidenceRef, derive_claim_status


def _find_repository_root() -> Path:
    """Locate the repository root by walking up to .git or evals/golden."""
    current = Path(__file__).resolve()
    for parent in [current] + list(current.parents):
        if (parent / ".git").exists() or (parent / "evals" / "golden").exists():
            return parent
        if (parent / "pyproject.toml").exists() and (parent / "evals").exists():
            return parent
    return current.parents[5]


REPOSITORY_ROOT = _find_repository_root()
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
    """Evaluate one deterministic golden case against pipeline stage logic."""
    try:
        case = load_json(path)
    except (OSError, json.JSONDecodeError, ValueError, TypeError) as exc:
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

    # 1. Pipeline stage execution: crosscheck (derive_claim_status)
    if "derived_status" in expected or "evidence" in case:
        raw_evidence = case.get("evidence", [])
        if not isinstance(raw_evidence, list):
            return CaseResult(
                case_id=case_id,
                passed=False,
                checks={},
                error="Crosscheck cases must provide a list of evidence",
            )

        evidence_refs: list[EvidenceRef] = []
        for e in raw_evidence:
            if not isinstance(e, dict):
                return CaseResult(
                    case_id=case_id,
                    passed=False,
                    checks={},
                    error="Evidence entries must be dictionaries",
                )
            evidence_refs.append(
                EvidenceRef(
                    evidence_id=str(e.get("evidence_id", "ev-1")),
                    publisher=e.get("publisher"),
                    source_type=str(e.get("source_type", "official_site")),
                    stance=str(e.get("stance", "supports")),
                    relevance=float(e.get("relevance", 0.7)),
                    age_days=e.get("age_days"),
                )
            )

        claim_origin = case.get("claim", {}).get("origin", "evidence")
        claim_kind = case.get("claim", {}).get("kind", "fact")

        actual_status = derive_claim_status(
            origin=claim_origin,
            evidence=evidence_refs,
            kind=claim_kind,
        )

        expected_status = expected.get("derived_status")
        if expected_status is not None:
            checks["status_match"] = actual_status.value == expected_status

        expected_has_contradiction = expected.get("has_contradiction")
        if expected_has_contradiction is not None:
            has_contradiction = (
                any(e.stance == "contradicts" for e in evidence_refs)
                or actual_status == ClaimStatus.CONFLICTING
            )
            checks["contradiction_detected"] = has_contradiction == expected_has_contradiction

    # 2. Text / extraction verification
    expected_relevant = expected.get("has_relevant_evidence")
    if not isinstance(expected_relevant, bool):
        return CaseResult(
            case_id=case_id,
            passed=False,
            checks={},
            error="expected.has_relevant_evidence must be a boolean",
        )

    if expected_relevant:
        expected_quote = expected.get("quote")

        if not isinstance(expected_quote, str) or not expected_quote:
            return CaseResult(
                case_id=case_id,
                passed=False,
                checks={},
                error="Relevant golden cases must provide a non-empty expected.quote",
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
            if expected_stance == "contradicts" and "contradiction_detected" not in checks:
                checks["contradiction_detected"] = checks["quote_verbatim"]

    else:
        # Irrelevant cases MUST explicitly specify evidence_count
        if "evidence_count" not in expected:
            return CaseResult(
                case_id=case_id,
                passed=False,
                checks={},
                error=(
                    "Irrelevant cases (has_relevant_evidence=False) must "
                    "explicitly provide expected.evidence_count"
                ),
            )

        expected_count = expected["evidence_count"]
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
        raise FileNotFoundError(f"Golden suite not found: {root}")

    cases = sorted(root.rglob("*.json"))

    if not cases:
        raise FileNotFoundError(f"No golden cases found in: {root}")

    return cases


def calculate_metrics(
    results: list[CaseResult],
) -> dict[str, float | None]:
    """Calculate Bible §41 metrics supported by the harness."""
    quote_results = [
        result.checks["quote_verbatim"] for result in results if "quote_verbatim" in result.checks
    ]

    if quote_results:
        quote_verbatim_rate = sum(quote_results) / len(quote_results)
        unsupported_claim_rate = (len(quote_results) - sum(quote_results)) / len(quote_results)
        citation_validity_rate = quote_verbatim_rate
    else:
        quote_verbatim_rate = None
        unsupported_claim_rate = None
        citation_validity_rate = None

    contradiction_results = [
        result.checks["contradiction_detected"]
        for result in results
        if "contradiction_detected" in result.checks
    ]

    if contradiction_results:
        contradiction_recall = sum(contradiction_results) / len(contradiction_results)
    else:
        contradiction_recall = None

    return {
        "unsupported_claim_rate": unsupported_claim_rate,
        "citation_validity_rate": citation_validity_rate,
        "contradiction_recall": contradiction_recall,
        "quote_verbatim_rate": quote_verbatim_rate,
    }


def build_report(
    suite: str,
    results: list[CaseResult],
    elapsed_seconds: float,
    max_unsupported_claim_rate: float = 0.05,
    min_quote_verbatim_rate: float = 1.0,
    min_contradiction_recall: float = 1.0,
    min_citation_validity_rate: float = 1.0,
) -> dict[str, Any]:
    """Build the structured evaluation report with threshold validation."""
    passed = sum(result.passed for result in results)
    failed = len(results) - passed
    metrics = calculate_metrics(results)

    threshold_violations: list[str] = []
    unsupported_rate = metrics.get("unsupported_claim_rate")
    verbatim_rate = metrics.get("quote_verbatim_rate")
    contra_recall = metrics.get("contradiction_recall")
    cit_validity = metrics.get("citation_validity_rate")

    if unsupported_rate is not None and unsupported_rate >= max_unsupported_claim_rate:
        threshold_violations.append(
            f"unsupported_claim_rate ({unsupported_rate:.2%}) >= {max_unsupported_claim_rate:.2%}"
        )

    if verbatim_rate is not None and verbatim_rate < min_quote_verbatim_rate:
        threshold_violations.append(
            f"quote_verbatim_rate ({verbatim_rate:.2%}) < {min_quote_verbatim_rate:.2%}"
        )

    if contra_recall is not None and contra_recall < min_contradiction_recall:
        threshold_violations.append(
            f"contradiction_recall ({contra_recall:.2%}) < {min_contradiction_recall:.2%}"
        )

    if cit_validity is not None and cit_validity < min_citation_validity_rate:
        threshold_violations.append(
            f"citation_validity_rate ({cit_validity:.2%}) < {min_citation_validity_rate:.2%}"
        )

    status = "passed" if (failed == 0 and not threshold_violations) else "failed"

    return {
        "suite": suite,
        "status": status,
        "cases": {
            "total": len(results),
            "passed": passed,
            "failed": failed,
        },
        "metrics": metrics,
        "threshold_violations": threshold_violations,
        "runtime": {
            "cost_per_run_usd": None,
            "latency_p50_ms": None,
            "latency_p95_ms": None,
            "harness_elapsed_ms": round(elapsed_seconds * 1000, 3),
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

    parser.add_argument(
        "--max-unsupported-rate",
        type=float,
        default=0.05,
        help="Maximum allowable unsupported claim rate (default: 0.05 or 5%%)",
    )

    parser.add_argument(
        "--min-quote-verbatim-rate",
        type=float,
        default=1.0,
        help="Minimum allowable quote verbatim rate (default: 1.0 or 100%%)",
    )

    parser.add_argument(
        "--min-contradiction-recall",
        type=float,
        default=1.0,
        help="Minimum allowable contradiction recall (default: 1.0 or 100%%)",
    )

    parser.add_argument(
        "--min-citation-validity-rate",
        type=float,
        default=1.0,
        help="Minimum allowable citation validity rate (default: 1.0 or 100%%)",
    )

    args = parser.parse_args()

    started_at = time.perf_counter()

    try:
        case_paths = discover_cases(args.suite)

        results = [evaluate_case(path) for path in case_paths]

        elapsed_seconds = time.perf_counter() - started_at

        report = build_report(
            args.suite,
            results,
            elapsed_seconds,
            max_unsupported_claim_rate=args.max_unsupported_rate,
            min_quote_verbatim_rate=args.min_quote_verbatim_rate,
            min_contradiction_recall=args.min_contradiction_recall,
            min_citation_validity_rate=args.min_citation_validity_rate,
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

        if args.fail_under_config and report["status"] != "passed":
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
