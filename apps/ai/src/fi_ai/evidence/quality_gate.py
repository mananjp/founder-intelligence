"""Pre-display quality gate (Bible §27): what supports it, how recent, independent?, what contradicts, what's unknown."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class GateResult:
    passed: bool
    reasons: list[str] = field(default_factory=list)


def check_recommendation(
    cited_claim_ids: list[str], known_claim_ids: set[str], has_unknowns_section: bool
) -> GateResult:
    reasons: list[str] = []
    if not cited_claim_ids:
        reasons.append("no evidence cited")
    unknown = [c for c in cited_claim_ids if c not in known_claim_ids]
    if unknown:
        reasons.append(f"cites non-existent claims: {unknown}")
    if not has_unknowns_section:
        reasons.append("missing unknowns/uncertainty")
    return GateResult(passed=not reasons, reasons=reasons)
