"""Tests for fi_ai.interview — S2-12 Adaptive Interview Turn.

All tests use FakeLLM (T11) via set_completion_backend — no real API calls,
no database, no environment keys required.

Coverage map (T12 acceptance criteria):
  1.  Valid structured interview response returned
  2.  Exactly one question per turn
  3.  Resolved variables extracted from founder input (this turn only)
  4.  Missing variable tracking across turn history
  5.  isComplete=False while required variables remain missing
  6.  Complete ResearchBrief returned when all required variables resolved
  7.  Invalid JSON from LLM → T11 retry → success
  8.  Endpoint rejects missing or invalid internal token (401)
  9.  Endpoint returns expected response structure
  10. Founder input is never replaced with fabricated information
"""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from fi_ai.interview import (
    REQUIRED_VARIABLES,
    AiTurnResponse,
    DraftBrief,
    _missing_variables,
    _resolved_variables,
    build_messages,
    run_interview_turn,
)
from fi_ai.llm.fake import FakeLLM
from fi_ai.llm.router import reset_completion_backend, set_completion_backend
from fi_ai.main import app

# ---------------------------------------------------------------------------
# Shared fixtures and helpers
# ---------------------------------------------------------------------------

TOKEN = "test-token"

_BASE_PAYLOAD: dict = {
    "ideaId": "00000000-0000-0000-0000-000000000001",
    "ideaTitle": "VendorClear",
    "rawDescription": "Automates vendor security questionnaire review for hospitals.",
    "geography": ["US"],
    "turnHistory": [],
    "founderMessage": "We target procurement teams at mid-sized hospitals.",
}


def _full_payload() -> dict:
    """Payload whose turnHistory already carries all 7 required variables resolved."""
    resolved_turns = [
        {
            "role": "founder",
            "content": "We help hospital procurement teams.",
            "extracted": {
                "customer": "Hospital procurement teams",
                "problem": "45-day vendor review cycles",
                "geography": ["US"],
                "category": "Healthcare compliance SaaS",
                "alternatives": "Manual spreadsheets and consulting",
                "businessModel": "Annual subscription + per-assessment fee",
                "differentiation": "Native HECVAT/HITRUST framework mapping",
            },
        }
    ]
    return {**_BASE_PAYLOAD, "turnHistory": resolved_turns}


def _turn_response_json(**overrides) -> str:
    """Build a valid AiTurnResponse JSON string for FakeLLM to return."""
    data: dict = {
        "question": "What is the core pain point your customers face?",
        "extracted": {"customer": "Hospital procurement teams"},
        "isComplete": False,
        "draftBrief": None,
    }
    data.update(overrides)
    # Remove draftBrief key entirely when None — matches model_dump(exclude_none=True)
    if data["draftBrief"] is None:
        del data["draftBrief"]
    return json.dumps(data)


def _complete_response_json() -> str:
    return json.dumps({
        "question": "Thank you — your brief is complete.",
        "extracted": {"differentiation": "Native HECVAT/HITRUST mapping"},
        "isComplete": True,
        "draftBrief": {
            "problem": "45-day vendor review cycles",
            "customer": "Hospital procurement teams",
            "geography": ["US"],
            "category": "Healthcare compliance SaaS",
            "alternatives": "Manual spreadsheets",
            "businessModel": "Annual subscription + per-assessment fee",
            "differentiation": "Native HECVAT/HITRUST mapping",
            "knownEvidence": [],
            "unknowns": [],
            "researchQuestions": [],
        },
    })


@pytest.fixture(autouse=True)
def restore_backend():
    """Always restore the real LiteLLM backend after each test."""
    yield
    reset_completion_backend()


@pytest.fixture()
def fake() -> FakeLLM:
    f = FakeLLM()
    set_completion_backend(f)
    return f


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


# ---------------------------------------------------------------------------
# 1. Valid structured interview response returned
# ---------------------------------------------------------------------------

def test_valid_structured_response_returned(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_raw(_turn_response_json())

    result = run_interview_turn(_BASE_PAYLOAD)

    assert isinstance(result, AiTurnResponse)
    assert fake.call_count == 1


# ---------------------------------------------------------------------------
# 2. Exactly one question per turn
# ---------------------------------------------------------------------------

def test_exactly_one_question_per_turn(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_raw(_turn_response_json(question="What is your target customer segment?"))

    result = run_interview_turn(_BASE_PAYLOAD)

    assert isinstance(result.question, str)
    assert len(result.question.strip()) > 0
    # The schema enforces a single string — structural guarantee
    assert not isinstance(result.question, list)


# ---------------------------------------------------------------------------
# 3. Resolved variables extracted from founder input (this turn only)
# ---------------------------------------------------------------------------

def test_extracted_contains_only_current_turn_variables(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    # Only 'customer' resolved this turn
    fake.enqueue_raw(_turn_response_json(
        extracted={"customer": "Hospital procurement teams"},
    ))

    result = run_interview_turn(_BASE_PAYLOAD)

    assert result.extracted == {"customer": "Hospital procurement teams"}
    assert "problem" not in result.extracted  # not resolved this turn


def test_extracted_is_empty_dict_when_nothing_resolved(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_raw(_turn_response_json(extracted={}))

    result = run_interview_turn(_BASE_PAYLOAD)

    assert result.extracted == {}


# ---------------------------------------------------------------------------
# 4. Missing variable tracking across turn history
# ---------------------------------------------------------------------------

def test_missing_variables_computed_from_turn_history():
    """_missing_variables returns only variables not already in resolved dict."""
    resolved = {"problem": "x", "customer": "y", "geography": ["US"]}
    missing = _missing_variables(resolved)

    assert "problem" not in missing
    assert "customer" not in missing
    assert "geography" not in missing
    assert set(missing) == {"category", "alternatives", "businessModel", "differentiation"}


def test_resolved_variables_aggregated_from_history():
    """_resolved_variables merges extracted dicts across all turns."""
    history = [
        {"role": "founder", "content": "x", "extracted": {"problem": "pain"}},
        {"role": "assistant", "content": "q", "extracted": None},
        {"role": "founder", "content": "y", "extracted": {"customer": "hospitals"}},
    ]
    resolved = _resolved_variables(history)

    assert resolved["problem"] == "pain"
    assert resolved["customer"] == "hospitals"


def test_missing_variables_includes_all_when_history_empty():
    resolved = _resolved_variables([])
    missing = _missing_variables(resolved)

    assert set(missing) == set(REQUIRED_VARIABLES)


# ---------------------------------------------------------------------------
# 5. isComplete=False while required variables remain missing
# ---------------------------------------------------------------------------

def test_is_complete_false_when_variables_missing(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_raw(_turn_response_json(isComplete=False))

    result = run_interview_turn(_BASE_PAYLOAD)  # turnHistory is empty → all missing

    assert result.isComplete is False
    assert result.draftBrief is None


# ---------------------------------------------------------------------------
# 6. Complete ResearchBrief returned when all required variables resolved
# ---------------------------------------------------------------------------

def test_draft_brief_populated_when_complete(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_raw(_complete_response_json())

    result = run_interview_turn(_full_payload())

    assert result.isComplete is True
    assert result.draftBrief is not None
    assert isinstance(result.draftBrief, DraftBrief)
    assert result.draftBrief.problem is not None
    assert result.draftBrief.customer is not None
    assert isinstance(result.draftBrief.geography, list)


def test_draft_brief_contains_only_founder_stated_values(monkeypatch, fake):
    """draftBrief values must trace to the conversation — not fabricated defaults."""
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_raw(_complete_response_json())

    result = run_interview_turn(_full_payload())

    assert result.draftBrief is not None
    # Values must match what was in the conversation, not generic placeholders
    assert result.draftBrief.customer == "Hospital procurement teams"
    assert result.draftBrief.businessModel == "Annual subscription + per-assessment fee"


# ---------------------------------------------------------------------------
# Completion guard — server-side isComplete validation
# ---------------------------------------------------------------------------

def test_guard_downgrades_premature_is_complete(monkeypatch, fake):
    """If the LLM returns isComplete=True but required variables are still missing,
    the server-side guard must set isComplete=False and clear draftBrief."""
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")

    # LLM claims complete after resolving only 'customer' — 6 variables still missing
    fake.enqueue_raw(json.dumps({
        "question": "Thanks, brief is done!",
        "extracted": {"customer": "Hospital procurement teams"},
        "isComplete": True,
        "draftBrief": {
            "problem": None, "customer": "Hospital procurement teams",
            "geography": [], "category": None, "alternatives": None,
            "businessModel": None, "differentiation": None,
            "knownEvidence": [], "unknowns": [], "researchQuestions": [],
        },
    }))

    result = run_interview_turn(_BASE_PAYLOAD)  # turnHistory empty → 7 missing

    assert result.isComplete is False, "Guard must downgrade premature isComplete"
    assert result.draftBrief is None, "Guard must clear draftBrief when incomplete"
    # extracted values are preserved
    assert result.extracted == {"customer": "Hospital procurement teams"}
    # question is preserved — the LLM's question is still valid
    assert len(result.question) > 0


def test_guard_preserves_legitimate_completion(monkeypatch, fake):
    """If all required variables are resolved, the guard must leave isComplete=True
    and draftBrief intact."""
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_raw(_complete_response_json())

    result = run_interview_turn(_full_payload())

    assert result.isComplete is True, "Guard must not downgrade a legitimate completion"
    assert result.draftBrief is not None, "Guard must preserve draftBrief when complete"


def test_guard_accounts_for_current_turn_extracted_values(monkeypatch, fake):
    """Variables resolved in this turn's 'extracted' must count toward completion.
    If all 7 are covered by prior history + this turn, isComplete=True is valid."""
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")

    # Prior history has 6 of 7 variables; this turn resolves the last one
    history_with_six = [
        {
            "role": "founder",
            "content": "...",
            "extracted": {
                "customer": "Hospitals",
                "problem": "45-day delays",
                "geography": ["US"],
                "category": "Healthcare SaaS",
                "alternatives": "Manual processes",
                "businessModel": "Annual subscription",
                # 'differentiation' is missing
            },
        }
    ]
    payload_almost_complete = {**_BASE_PAYLOAD, "turnHistory": history_with_six}

    # LLM resolves the final variable and sets isComplete=True
    fake.enqueue_raw(json.dumps({
        "question": "Great — your brief is ready.",
        "extracted": {"differentiation": "Native HECVAT/HITRUST mapping"},
        "isComplete": True,
        "draftBrief": {
            "problem": "45-day delays",
            "customer": "Hospitals",
            "geography": ["US"],
            "category": "Healthcare SaaS",
            "alternatives": "Manual processes",
            "businessModel": "Annual subscription",
            "differentiation": "Native HECVAT/HITRUST mapping",
            "knownEvidence": [], "unknowns": [], "researchQuestions": [],
        },
    }))

    result = run_interview_turn(payload_almost_complete)

    assert result.isComplete is True, "Guard must allow completion when final variable resolved this turn"
    assert result.draftBrief is not None
    assert result.extracted == {"differentiation": "Native HECVAT/HITRUST mapping"}


# ---------------------------------------------------------------------------
# 7. Invalid JSON from LLM → T11 retry → success on second attempt
# ---------------------------------------------------------------------------

def test_invalid_json_retries_and_succeeds(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_raw("this is not valid json")      # first attempt — triggers retry
    fake.enqueue_raw(_turn_response_json())          # second attempt — succeeds

    result = run_interview_turn(_BASE_PAYLOAD)

    assert isinstance(result, AiTurnResponse)
    assert fake.call_count == 2


def test_provider_failure_returns_degraded_response(monkeypatch, fake):
    """On exhausted retries, run_interview_turn returns a safe fallback, not an exception."""
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    # Both attempts fail validation — ValidationRetryExhausted is raised by T11
    fake.enqueue_raw("bad1")
    fake.enqueue_raw("bad2")

    result = run_interview_turn(_BASE_PAYLOAD)

    assert isinstance(result, AiTurnResponse)
    assert result.isComplete is False
    assert result.extracted == {}
    # Question must be a non-empty degraded prompt
    assert len(result.question) > 0


# ---------------------------------------------------------------------------
# 8. Endpoint rejects missing or invalid internal token (401)
# ---------------------------------------------------------------------------

def test_endpoint_rejects_missing_token(client):
    with patch("fi_ai.main.settings") as mock_settings:
        mock_settings.internal_service_token = TOKEN
        response = client.post(
            "/internal/interview/turn",
            json={**_BASE_PAYLOAD},
        )
    assert response.status_code == 401


def test_endpoint_rejects_wrong_token(client):
    with patch("fi_ai.main.settings") as mock_settings:
        mock_settings.internal_service_token = TOKEN
        response = client.post(
            "/internal/interview/turn",
            json={**_BASE_PAYLOAD},
            headers={"x-internal-token": "wrong-token"},
        )
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# 9. Endpoint returns expected response structure
# ---------------------------------------------------------------------------

def test_endpoint_returns_expected_structure(monkeypatch, client, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_raw(_turn_response_json(
        question="What is the core pain point?",
        extracted={"customer": "Hospitals"},
    ))

    with patch("fi_ai.main.settings") as mock_settings:
        mock_settings.internal_service_token = TOKEN
        response = client.post(
            "/internal/interview/turn",
            json={**_BASE_PAYLOAD},
            headers={"x-internal-token": TOKEN},
        )

    assert response.status_code == 200
    body = response.json()
    # T4 contract fields — must all be present with correct types
    assert "question" in body
    assert isinstance(body["question"], str)
    assert len(body["question"]) > 0
    assert "extracted" in body
    assert isinstance(body["extracted"], dict)
    assert "isComplete" in body
    assert isinstance(body["isComplete"], bool)


def test_endpoint_camelcase_field_names(monkeypatch, client, fake):
    """isComplete must be camelCase — matches T4's TypeScript AiInterviewTurnResult."""
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_raw(_complete_response_json())

    with patch("fi_ai.main.settings") as mock_settings:
        mock_settings.internal_service_token = TOKEN
        response = client.post(
            "/internal/interview/turn",
            json=_full_payload(),
            headers={"x-internal-token": TOKEN},
        )

    assert response.status_code == 200
    body = response.json()
    assert "isComplete" in body       # camelCase — not "is_complete"
    assert "draftBrief" in body       # camelCase — not "draft_brief"
    assert body["isComplete"] is True


# ---------------------------------------------------------------------------
# 10. Founder input is never replaced with fabricated information
# ---------------------------------------------------------------------------

def test_founder_input_not_fabricated(monkeypatch, fake):
    """Extracted values must come from the founder's message, not invented by tests."""
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    founder_stated = "We charge $299/month per user with annual commitment discounts."
    fake.enqueue_raw(_turn_response_json(
        extracted={"businessModel": founder_stated},
    ))

    result = run_interview_turn({
        **_BASE_PAYLOAD,
        "founderMessage": founder_stated,
    })

    # The extracted value must reflect what the founder actually said
    assert result.extracted.get("businessModel") == founder_stated


def test_build_messages_includes_founder_message():
    """build_messages must include the founder's exact message in the user prompt."""
    payload = {
        **_BASE_PAYLOAD,
        "founderMessage": "We sell exclusively to NHS trusts in the UK.",
    }
    messages = build_messages(payload)

    user_content = messages[1]["content"]
    assert "We sell exclusively to NHS trusts in the UK." in user_content


def test_build_messages_lists_missing_variables():
    """build_messages must surface which variables are still missing."""
    # Empty turnHistory → all 7 required variables are missing
    messages = build_messages(_BASE_PAYLOAD)
    user_content = messages[1]["content"]

    for var in REQUIRED_VARIABLES:
        assert var in user_content


def test_build_messages_shows_resolved_variables():
    """build_messages must include already-resolved variables so the LLM doesn't re-ask."""
    payload_with_history = {
        **_BASE_PAYLOAD,
        "turnHistory": [
            {"role": "founder", "content": "Hospitals", "extracted": {"customer": "Hospitals"}}
        ],
    }
    messages = build_messages(payload_with_history)
    user_content = messages[1]["content"]

    assert "customer" in user_content
    assert "Hospitals" in user_content
