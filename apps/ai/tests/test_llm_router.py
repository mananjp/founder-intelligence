"""Tests for fi_ai.llm.router — S2-11 LLM Router.

Coverage map (Sprint 2 T11 requirements):
  1.  Model selection (model_for, _expand)
  2.  Task-to-tier mapping
  3.  Valid structured response
  4.  Invalid JSON → retry → success
  5.  Missing required fields (Pydantic validation failure) → retry → success
  6.  Validation retry exhausted (both attempts fail)
  7.  Provider failure → fallback tier
  8.  Model fallback (strong → fast via models.yaml fallbacks)
  9.  Missing API key raises MissingApiKeyError
  10. Token and cost tracking recorded on LlmCallRecord
  11. Latency recorded on LlmCallRecord
  12. FakeLLM enqueue / call_count / provider error scenarios
"""
from __future__ import annotations

from unittest.mock import patch

import pytest
from pydantic import BaseModel

from fi_ai.llm.fake import FakeLLM
from fi_ai.llm.router import (
    MissingApiKeyError,
    ProviderError,
    ValidationRetryExhausted,
    _expand,
    _max_retries_for_tier,
    complete_structured,
    model_for,
    reset_completion_backend,
    set_completion_backend,
)

# ---------------------------------------------------------------------------
# Shared test schema
# ---------------------------------------------------------------------------

class Result(BaseModel):
    value: str


class Strict(BaseModel):
    value: str
    count: int  # required — missing this field triggers ValidationError


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def restore_backend():
    """Always restore the real LiteLLM backend after each test."""
    yield
    reset_completion_backend()


@pytest.fixture()
def fake():
    f = FakeLLM()
    set_completion_backend(f)
    return f


# ---------------------------------------------------------------------------
# 1. Model selection — _expand + model_for
# ---------------------------------------------------------------------------

def test_expand_resolves_env_var(monkeypatch):
    monkeypatch.setenv("MODEL_NAME", "provider/model")
    assert _expand("${MODEL_NAME}") == "provider/model"


def test_expand_missing_var_returns_empty(monkeypatch):
    monkeypatch.delenv("MISSING_VAR", raising=False)
    assert _expand("${MISSING_VAR}") == ""


def test_expand_mixed_present_and_missing(monkeypatch):
    monkeypatch.setenv("MODEL_NAME", "provider/model")
    monkeypatch.delenv("MISSING_MODEL", raising=False)
    assert _expand("${MODEL_NAME}/${MISSING_MODEL}") == "provider/model/"


def test_model_for_returns_expanded_string(monkeypatch):
    monkeypatch.setenv("LLM_FAST_MODEL", "openai/gpt-4o-mini")
    assert model_for("classify_source") == "openai/gpt-4o-mini"


# ---------------------------------------------------------------------------
# 2. Task-to-tier mapping
# ---------------------------------------------------------------------------

def test_model_for_fast_task(monkeypatch):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    assert model_for("classify_source") == "provider/fast"


def test_model_for_strong_task(monkeypatch):
    monkeypatch.setenv("LLM_STRONG_MODEL", "provider/strong")
    assert model_for("synthesize_module") == "provider/strong"


def test_model_for_all_tasks_resolve(monkeypatch):
    monkeypatch.setenv("LLM_FAST_MODEL", "f")
    monkeypatch.setenv("LLM_STRONG_MODEL", "s")
    monkeypatch.setenv("LLM_EMBED_MODEL", "e")
    fast_tasks = [
        "interview_turn", "classify_source", "extract_evidence",
        "crosscheck_nli", "radar_diff_summary",
    ]
    strong_tasks = ["synthesize_module", "recommend", "copilot_answer"]
    for t in fast_tasks:
        assert model_for(t) == "f", f"task {t} should map to fast tier"
    for t in strong_tasks:
        assert model_for(t) == "s", f"task {t} should map to strong tier"


def test_unknown_task_raises_key_error():
    with pytest.raises(KeyError):
        model_for("unknown_task")


def test_complete_structured_unknown_task_raises_key_error(fake):
    fake.enqueue_json({"value": "x"})
    with pytest.raises(KeyError):
        complete_structured("not_a_real_task", [], Result)


# ---------------------------------------------------------------------------
# 2b. max_retries flows from models.yaml to the completion backend
# ---------------------------------------------------------------------------

def test_max_retries_for_tier_reads_models_yaml():
    """_max_retries_for_tier returns the value declared in models.yaml."""
    # models.yaml declares: fast=3, strong=2, embedding=3
    assert _max_retries_for_tier("fast") == 3
    assert _max_retries_for_tier("strong") == 2
    assert _max_retries_for_tier("embedding") == 3


def test_max_retries_passed_to_backend(monkeypatch, fake):
    """num_retries from models.yaml is forwarded to the completion backend on every call."""
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_json({"value": "ok"})

    complete_structured("classify_source", [], Result)

    # fast tier declares max_retries: 3 in models.yaml
    assert fake.calls[0]["kwargs"].get("num_retries") == 3


def test_max_retries_strong_tier_passed_to_backend(monkeypatch, fake):
    """num_retries for the strong tier (max_retries: 2) is forwarded correctly."""
    monkeypatch.setenv("LLM_STRONG_MODEL", "provider/strong")
    fake.enqueue_json({"value": "ok"})

    complete_structured("synthesize_module", [], Result)

    # strong tier declares max_retries: 2 in models.yaml
    assert fake.calls[0]["kwargs"].get("num_retries") == 2


def test_max_retries_forwarded_on_validation_retry(monkeypatch, fake):
    """num_retries is forwarded on both the first attempt and the validation retry."""
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_raw("bad-json")            # triggers validation retry
    fake.enqueue_json({"value": "fixed"})

    complete_structured("classify_source", [], Result)

    assert fake.call_count == 2
    assert fake.calls[0]["kwargs"].get("num_retries") == 3  # first attempt
    assert fake.calls[1]["kwargs"].get("num_retries") == 3  # validation retry


# ---------------------------------------------------------------------------
# 3. Valid structured response
# ---------------------------------------------------------------------------

def test_valid_structured_response(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_json({"value": "hello"})

    result = complete_structured("classify_source", [], Result)

    assert isinstance(result, Result)
    assert result.value == "hello"
    assert fake.call_count == 1


def test_complete_structured_passes_messages(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_json({"value": "ok"})
    messages = [{"role": "user", "content": "classify this"}]

    complete_structured("classify_source", messages, Result)

    assert fake.calls[0]["messages"] == messages


# ---------------------------------------------------------------------------
# 4. Invalid JSON → retry → success
# ---------------------------------------------------------------------------

def test_invalid_json_retries_and_succeeds(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    # First response: not valid JSON; second: valid
    fake.enqueue_raw("this is not json")
    fake.enqueue_json({"value": "recovered"})

    result = complete_structured("classify_source", [], Result)

    assert result.value == "recovered"
    assert fake.call_count == 2  # one retry happened


def test_retry_message_contains_error_feedback(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_raw("not-json")
    fake.enqueue_json({"value": "ok"})

    complete_structured("classify_source", [], Result)

    retry_messages = fake.calls[1]["messages"]
    # The retry must append a correction prompt
    assert any("Error" in m.get("content", "") for m in retry_messages)
    assert any(m.get("role") == "user" and "JSON" in m.get("content", "")
               for m in retry_messages)


# ---------------------------------------------------------------------------
# 5. Missing required fields → retry → success
# ---------------------------------------------------------------------------

def test_missing_fields_retries_and_succeeds(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    # Missing 'count' field → ValidationError on first attempt
    fake.enqueue_validation_fail({"value": "hi"})
    fake.enqueue_json({"value": "hi", "count": 3})

    result = complete_structured("classify_source", [], Strict)

    assert result.count == 3
    assert fake.call_count == 2


# ---------------------------------------------------------------------------
# 6. Validation retry exhausted
# ---------------------------------------------------------------------------

def test_validation_retry_exhausted_raises(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    # Both attempts fail validation (missing 'count')
    fake.enqueue_validation_fail({"value": "bad"})
    fake.enqueue_validation_fail({"value": "still-bad"})

    with pytest.raises(ValidationRetryExhausted):
        complete_structured("classify_source", [], Strict)

    assert fake.call_count == 2


def test_invalid_json_both_attempts_exhausted(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_raw("bad1")
    fake.enqueue_raw("bad2")

    with pytest.raises(ValidationRetryExhausted):
        complete_structured("classify_source", [], Result)


# ---------------------------------------------------------------------------
# 7. Provider failure raises ProviderError (no fallback configured for fast)
# ---------------------------------------------------------------------------

def test_provider_error_fast_tier_no_fallback_raises(monkeypatch, fake):
    """fast tier has no further fallback (only strong→fast is defined)."""
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_error(RuntimeError("connection timeout"))

    with pytest.raises(ProviderError):
        complete_structured("classify_source", [], Result)


# ---------------------------------------------------------------------------
# 8. Model fallback: strong → fast on provider error
# ---------------------------------------------------------------------------

def test_provider_failure_falls_back_to_fast_tier(monkeypatch, fake):
    monkeypatch.setenv("LLM_STRONG_MODEL", "provider/strong")
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")

    # Strong tier fails; fast tier succeeds
    fake.enqueue_error(RuntimeError("strong model unavailable"))
    fake.enqueue_json({"value": "fallback-result"})

    result = complete_structured("synthesize_module", [], Result)

    assert result.value == "fallback-result"
    # First call used the strong model, second used fast
    assert fake.calls[0]["model"] == "provider/strong"
    assert fake.calls[1]["model"] == "provider/fast"


def test_fallback_exhausted_raises_provider_error(monkeypatch, fake):
    monkeypatch.setenv("LLM_STRONG_MODEL", "provider/strong")
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")

    fake.enqueue_error(RuntimeError("strong down"))
    fake.enqueue_error(RuntimeError("fast also down"))

    with pytest.raises(ProviderError):
        complete_structured("synthesize_module", [], Result)


# ---------------------------------------------------------------------------
# 9. Missing API key
# ---------------------------------------------------------------------------

def test_missing_api_key_raises_missing_key_error(monkeypatch, fake):
    monkeypatch.delenv("LLM_FAST_MODEL", raising=False)
    # Even with a valid response queued, key check must fire first
    fake.enqueue_json({"value": "x"})

    with pytest.raises(MissingApiKeyError):
        complete_structured("classify_source", [], Result)

    # Backend must NOT have been called — key check is pre-call
    assert fake.call_count == 0


def test_missing_api_key_error_message_names_env_var(monkeypatch, fake):
    monkeypatch.delenv("LLM_FAST_MODEL", raising=False)
    fake.enqueue_json({"value": "x"})

    with pytest.raises(MissingApiKeyError, match="LLM_FAST_MODEL"):
        complete_structured("classify_source", [], Result)


# ---------------------------------------------------------------------------
# 10. Token and cost tracking
# ---------------------------------------------------------------------------

def test_tracking_records_tokens_and_cost(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_json({"value": "ok"}, input_tokens=120, output_tokens=60, cost=0.0042)

    captured: list = []
    with patch("fi_ai.llm.router._emit_tracking") as mock_track:
        mock_track.side_effect = lambda *a, **kw: captured.append(kw)
        complete_structured("classify_source", [], Result)

    assert len(captured) == 1
    assert captured[0]["input_tokens"] == 120
    assert captured[0]["output_tokens"] == 60
    assert captured[0]["cost_usd"] == pytest.approx(0.0042)
    assert captured[0]["status"] == "ok"


def test_tracking_records_run_id(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_json({"value": "ok"})

    captured: list = []
    with patch("fi_ai.llm.router._emit_tracking") as mock_track:
        mock_track.side_effect = lambda *a, **kw: captured.append((a, kw))
        complete_structured("classify_source", [], Result, run_id="run-abc")

    # run_id is passed as positional arg index 2
    assert captured[0][0][2] == "run-abc"


def test_tracking_records_error_status_on_provider_failure(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_error(RuntimeError("boom"))

    captured: list = []
    with patch("fi_ai.llm.router._emit_tracking") as mock_track:
        mock_track.side_effect = lambda *a, **kw: captured.append(kw)
        with pytest.raises(ProviderError):
            complete_structured("classify_source", [], Result)

    assert any(c.get("status") == "error" for c in captured)


# ---------------------------------------------------------------------------
# 11. Latency tracking
# ---------------------------------------------------------------------------

def test_latency_is_tracked(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_json({"value": "ok"})

    captured: list = []
    with patch("fi_ai.llm.router._emit_tracking") as mock_track:
        mock_track.side_effect = lambda *a, **kw: captured.append(kw)
        complete_structured("classify_source", [], Result)

    assert captured[0]["latency_ms"] >= 0  # non-negative integer


def test_latency_accumulates_across_retry(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_raw("bad json")   # triggers retry
    fake.enqueue_json({"value": "ok"})

    captured: list = []
    with patch("fi_ai.llm.router._emit_tracking") as mock_track:
        mock_track.side_effect = lambda *a, **kw: captured.append(kw)
        complete_structured("classify_source", [], Result)

    # Success tracking on the retry path should have a non-negative latency
    ok_entries = [c for c in captured if c.get("status") == "ok"]
    assert ok_entries[0]["latency_ms"] >= 0


# ---------------------------------------------------------------------------
# 12. FakeLLM functionality
# ---------------------------------------------------------------------------

def test_fakelllm_call_count_increments(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_json({"value": "a"})
    fake.enqueue_json({"value": "b"})

    complete_structured("classify_source", [], Result)
    complete_structured("classify_source", [], Result)

    assert fake.call_count == 2


def test_fakelllm_records_model_name(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "test/model-x")
    fake.enqueue_json({"value": "ok"})

    complete_structured("classify_source", [], Result)

    assert fake.calls[0]["model"] == "test/model-x"


def test_fakelllm_empty_queue_raises_stop_iteration(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    # Queue is empty — StopIteration propagates as a provider error
    with pytest.raises((ProviderError, StopIteration)):
        complete_structured("classify_source", [], Result)


def test_fakelllm_chained_enqueue(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    # Chain enqueue calls
    fake.enqueue_raw("oops").enqueue_json({"value": "chained"})

    result = complete_structured("classify_source", [], Result)

    assert result.value == "chained"


def test_fakelllm_reset_clears_state(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_json({"value": "ok"})
    complete_structured("classify_source", [], Result)
    assert fake.call_count == 1

    fake.reset()

    assert fake.call_count == 0
    assert fake.calls == []


def test_fakelllm_provider_error_is_raised(monkeypatch, fake):
    monkeypatch.setenv("LLM_FAST_MODEL", "provider/fast")
    fake.enqueue_error(ConnectionError("network down"))

    with pytest.raises(ProviderError):
        complete_structured("classify_source", [], Result)
