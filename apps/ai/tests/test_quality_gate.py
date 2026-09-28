from fi_ai.evidence.quality_gate import check_recommendation


def test_recommendation_passes_with_known_evidence_and_unknowns():
    result = check_recommendation(["claim-1"], {"claim-1"}, has_unknowns_section=True)

    assert result.passed is True
    assert result.reasons == []


def test_recommendation_reports_missing_evidence_and_unknowns():
    result = check_recommendation([], {"claim-1"}, has_unknowns_section=False)

    assert result.passed is False
    assert result.reasons == ["no evidence cited", "missing unknowns/uncertainty"]


def test_recommendation_reports_unknown_claim_ids():
    result = check_recommendation(["missing"], set(), has_unknowns_section=True)

    assert result.passed is False
    assert result.reasons == ["cites non-existent claims: ['missing']"]
