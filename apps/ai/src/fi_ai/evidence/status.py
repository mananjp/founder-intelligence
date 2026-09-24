"""Deterministic claim-status derivation (Bible §10). LLMs never assign a status directly."""

from __future__ import annotations

from dataclasses import dataclass

from fi_ai.evidence.schemas import ClaimStatus

PRIMARY_SOURCE_TYPES = {"official_site", "government", "filing", "user_upload"}


@dataclass(frozen=True)
class EvidenceRef:
    evidence_id: str
    publisher: str | None
    source_type: str
    stance: str = "supports"  # supports | contradicts
    relevance: float = 0.7
    age_days: int | None = None  # None = unknown age


def derive_claim_status(
    origin: str,  # 'evidence' | 'founder' | 'fi_hypothesis' | 'inferred'
    evidence: list[EvidenceRef],
    kind: str = "fact",  # 'fact' | 'signal'
    ttl_days: int = 365,
    relevance_min: float = 0.5,
) -> ClaimStatus:
    ev = [e for e in evidence if e.relevance >= relevance_min]
    supports = [e for e in ev if e.stance == "supports"]
    contradicts = [e for e in ev if e.stance == "contradicts"]

    if supports and contradicts:
        return ClaimStatus.CONFLICTING
    if contradicts and not supports:
        return ClaimStatus.CONFLICTING  # refuted claims surface as conflicting; UI shows the counter-evidence
    if not supports:
        return ClaimStatus.ASSUMPTION if origin in {"founder", "fi_hypothesis"} else ClaimStatus.UNVERIFIED
    if origin == "inferred":
        return ClaimStatus.INFERRED  # inherits caveats of its parents; parents' statuses shown in the trace

    fresh_primary = any(
        e.source_type in PRIMARY_SOURCE_TYPES and (e.age_days is None or e.age_days <= ttl_days)
        for e in supports
    )
    independent_publishers = len({e.publisher or e.evidence_id for e in supports})

    if kind == "signal":
        return ClaimStatus.DIRECTIONAL  # a signal is not proof (Appendix A)
    if fresh_primary:
        return ClaimStatus.VERIFIED
    if independent_publishers >= 2:
        return ClaimStatus.SUPPORTED
    return ClaimStatus.DIRECTIONAL
