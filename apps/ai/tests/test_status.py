from fi_ai.evidence.schemas import ClaimStatus
from fi_ai.evidence.status import EvidenceRef, derive_claim_status as d


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
    assert d("evidence", [ref("1", "a.com"), ref("2", "b.com", stance="contradicts")]) == ClaimStatus.CONFLICTING


def test_assumption_and_unverified():
    assert d("founder", []) == ClaimStatus.ASSUMPTION
    assert d("evidence", []) == ClaimStatus.UNVERIFIED


def test_signals_never_exceed_directional():
    assert d("evidence", [ref("1", "trends.google.com", "search_trend"), ref("2", "b.com")], kind="signal") == ClaimStatus.DIRECTIONAL


def test_inferred():
    assert d("inferred", [ref("1", "a.com")]) == ClaimStatus.INFERRED
