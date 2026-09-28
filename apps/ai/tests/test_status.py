from fi_ai.evidence.schemas import ClaimStatus
from fi_ai.evidence.status import EvidenceRef
from fi_ai.evidence.status import derive_claim_status as d


def ref(i, pub, st="news", stance="supports", age=30):
    return EvidenceRef(i, pub, st, stance, 0.9, age)


def test_verified_primary_fresh():
    assert d("evidence", [ref("1", "acme.com", "official_site")]) == ClaimStatus.VERIFIED


def test_stale_primary_falls_back():
    assert d("evidence", [ref("1", "acme.com", "official_site", age=900)]) == ClaimStatus.DIRECTIONAL


def test_supported_needs_two_independent_publishers():
    assert d("evidence", [ref("1", "a.com"), ref("2", "b.com")]) == ClaimStatus.SUPPORTED
    assert d("evidence", [ref("1", "a.com"), ref("2", "a.com")]) == ClaimStatus.DIRECTIONAL


def test_conflicting():
    assert (
        d("evidence", [ref("1", "a.com"), ref("2", "b.com", stance="contradicts")]) == ClaimStatus.CONFLICTING
    )


def test_contradicting_evidence_alone_is_conflicting():
    assert d("evidence", [ref("1", "a.com", stance="contradicts")]) == ClaimStatus.CONFLICTING


def test_assumption_and_unverified():
    assert d("founder", []) == ClaimStatus.ASSUMPTION
    assert d("evidence", []) == ClaimStatus.UNVERIFIED


def test_signals_never_exceed_directional():
    assert (
        d("evidence", [ref("1", "trends.google.com", "search_trend"), ref("2", "b.com")], kind="signal")
        == ClaimStatus.DIRECTIONAL
    )


def test_inferred():
    assert d("inferred", [ref("1", "a.com")]) == ClaimStatus.INFERRED


def test_low_relevance_evidence_is_ignored():
    assert d("evidence", [EvidenceRef("1", "a.com", "news", relevance=0.1)]) == ClaimStatus.UNVERIFIED


def test_hypothesis_without_evidence_is_an_assumption():
    assert d("fi_hypothesis", []) == ClaimStatus.ASSUMPTION


def test_freshness_ttl_and_unknown_publishers():
    assert (
        d(
            "evidence",
            [ref("1", None), ref("2", None)],
            ttl_days=10,
        )
        == ClaimStatus.SUPPORTED
    )
    assert d("evidence", [ref("1", "acme.com", "filing", age=11)], ttl_days=10) == ClaimStatus.DIRECTIONAL
