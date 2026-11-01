"""LLM router: task -> tier -> model, with retries, structured output validation and cost logging.

Rules:
  * Call sites pass a TASK NAME, never a model name.
  * Structured outputs are validated with Pydantic; on failure retry once with the validation error appended.
  * Every call is logged to `llm_calls` (task, model, tokens, cost, latency, run_id) and traced in Langfuse.
  * Credentials are read exclusively from environment variables — never hardcoded.
  * On provider failure the router falls back to the configured fallback tier (models.yaml `fallbacks` key).
  * A missing API key is a hard error — we never return fabricated results.

Public API
----------
model_for(task)                   -> str        model name string for a task
complete_structured(task, msgs, schema, run_id) -> T    full pipeline: route → call → validate → log
set_completion_backend(fn)        -> None        replace litellm for testing (FakeLLM)
reset_completion_backend()        -> None        restore litellm
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ValidationError

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config loading
# ---------------------------------------------------------------------------

_CFG: dict = yaml.safe_load(Path(__file__).with_name("models.yaml").read_text())


def _expand(v: str) -> str:
    """Expand ``${VAR}`` placeholders using environment variables.

    Missing variables are replaced with an empty string, which deliberately
    produces an invalid model string — LiteLLM will reject it with an
    AuthenticationError, preventing silent use of wrong credentials.
    """
    return re.sub(r"\$\{(\w+)\}", lambda m: os.getenv(m.group(1), ""), v)


def model_for(task: str) -> str:
    """Return the LiteLLM model string for *task*.

    Raises ``KeyError`` for unknown tasks (config is the source of truth).
    The returned string is env-expanded; if the underlying env var is unset
    it will be empty — callers that actually try to use it will get an
    AuthenticationError from LiteLLM.
    """
    tier: str = _CFG["tasks"][task]  # KeyError on unknown task — intentional
    return _expand(_CFG["tiers"][tier]["model"])


def _tier_for(task: str) -> str:
    return _CFG["tasks"][task]


def _model_for_tier(tier: str) -> str:
    return _expand(_CFG["tiers"][tier]["model"])


def _fallback_tier(tier: str) -> str | None:
    return _CFG.get("fallbacks", {}).get(tier)


def _timeout_for_tier(tier: str) -> int:
    return int(_CFG["tiers"][tier].get("timeout_s", 60))


def _max_retries_for_tier(tier: str) -> int:
    return int(_CFG["tiers"][tier].get("max_retries", 2))


# ---------------------------------------------------------------------------
# Completion backend seam (swapped out by FakeLLM in tests)
# ---------------------------------------------------------------------------

def _default_completion(model: str, messages: list[dict], **kwargs: Any) -> Any:
    """Thin wrapper around litellm.completion."""
    import litellm  # local import keeps module importable even without litellm installed

    return litellm.completion(model=model, messages=messages, **kwargs)


# Module-level mutable backend — replaced by tests via set_completion_backend.
_completion_backend = _default_completion


def set_completion_backend(fn: Any) -> None:
    """Replace the completion backend (for testing)."""
    global _completion_backend
    _completion_backend = fn


def reset_completion_backend() -> None:
    """Restore the real LiteLLM backend."""
    global _completion_backend
    _completion_backend = _default_completion


# ---------------------------------------------------------------------------
# Error types
# ---------------------------------------------------------------------------

class LlmRouterError(Exception):
    """Base class for all router errors."""


class MissingApiKeyError(LlmRouterError):
    """Raised when the model string resolves to empty (env var not set)."""


class ProviderError(LlmRouterError):
    """Raised when a provider call fails and all fallbacks are exhausted."""


class ValidationRetryExhausted(LlmRouterError):
    """Raised when Pydantic validation still fails after the retry budget."""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _check_api_key(model: str, task: str) -> None:
    """Raise MissingApiKeyError if *model* is empty (env var not set)."""
    if not model.strip():
        tier = _tier_for(task)
        env_var = re.search(r"\$\{(\w+)\}", _CFG["tiers"][tier]["model"])
        var_name = env_var.group(1) if env_var else "LLM_*_MODEL"
        raise MissingApiKeyError(
            f"Model env var '{var_name}' is not set. "
            f"Set it in your .env file before calling task='{task}'."
        )


def _extract_text(response: Any) -> str:
    """Pull the assistant message text out of a LiteLLM response object."""
    try:
        return response.choices[0].message.content or ""
    except (AttributeError, IndexError, TypeError):
        if isinstance(response, str):
            return response
        return str(response)


def _extract_usage(response: Any) -> tuple[int, int, float]:
    """Return (input_tokens, output_tokens, cost_usd) from a LiteLLM response."""
    try:
        usage = response.usage
        input_tok = int(usage.prompt_tokens or 0)
        output_tok = int(usage.completion_tokens or 0)
    except (AttributeError, TypeError):
        input_tok = output_tok = 0

    try:
        cost = float(response._hidden_params.get("response_cost", 0.0))
    except (AttributeError, TypeError, KeyError):
        cost = 0.0

    return input_tok, output_tok, cost


def _parse_and_validate[T: BaseModel](text: str, schema: type[T]) -> T:
    """Parse *text* as JSON and validate against *schema*.

    Raises ``json.JSONDecodeError`` or ``ValidationError`` on failure.
    """
    # Strip markdown code fences if the model wrapped its JSON
    stripped = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.DOTALL)
    data = json.loads(stripped)
    return schema.model_validate(data)


def _build_validation_retry_message(
    original_messages: list[dict], bad_text: str, error: str
) -> list[dict]:
    """Append a correction prompt to the message list for the retry call."""
    return original_messages + [
        {"role": "assistant", "content": bad_text},
        {
            "role": "user",
            "content": (
                f"Your previous response could not be parsed or validated.\n"
                f"Error: {error}\n\n"
                f"Please respond with ONLY a valid JSON object that satisfies the schema. "
                f"No markdown fences, no explanation — raw JSON only."
            ),
        },
    ]


# ---------------------------------------------------------------------------
# Core entry point
# ---------------------------------------------------------------------------

def complete_structured[T: BaseModel](
    task: str,
    messages: list[dict],
    schema: type[T],
    run_id: str | None = None,
) -> T:
    """Route *task* → tier → model, call via LiteLLM, validate with *schema*.

    Retry flow
    ----------
    1. Call the model.
    2. Parse JSON + Pydantic-validate.
    3. On ``json.JSONDecodeError`` or ``ValidationError``: append error feedback
       and retry **once** with the same model.
    4. If the retry still fails: raise ``ValidationRetryExhausted``.

    Fallback flow
    -------------
    On a provider-level exception (network error, rate limit, model unavailable):
    check ``models.yaml`` ``fallbacks`` and retry the full validate-and-retry
    loop on the fallback tier.  If the fallback also fails, raise ``ProviderError``.

    Credential gating
    -----------------
    If the model env-var is unset the model string will be empty; we detect
    that and raise ``MissingApiKeyError`` immediately rather than sending a
    malformed request to a provider.

    Cost tracking
    -------------
    Every attempt (success or failure) logs one row to ``llm_calls`` via
    ``_emit_tracking``.  Tracking failures are silently swallowed — they must
    never break inference.
    """
    if task not in _CFG.get("tasks", {}):
        raise KeyError(f"Unknown task '{task}'. Add it to models.yaml.")

    primary_tier = _tier_for(task)
    tiers_to_try: list[str] = [primary_tier]
    fallback = _fallback_tier(primary_tier)
    if fallback:
        tiers_to_try.append(fallback)

    last_error: Exception = ProviderError("no tiers attempted")

    for tier in tiers_to_try:
        model = _model_for_tier(tier)
        _check_api_key(model, task)  # MissingApiKeyError is always fatal — not caught

        try:
            return _attempt_with_validation_retry(
                task=task,
                tier=tier,
                model=model,
                messages=messages,
                schema=schema,
                run_id=run_id,
                num_retries=_max_retries_for_tier(tier),
            )
        except (ValidationRetryExhausted, MissingApiKeyError):
            raise  # validation exhausted and missing keys are not provider errors
        except Exception as exc:  # noqa: BLE001 — catch provider-level errors
            log.warning(
                "llm_router: provider error on tier=%s model=%s task=%s — %s",
                tier, model, task, exc,
            )
            _emit_tracking(task, model, run_id, status="error")
            last_error = exc

    raise ProviderError(
        f"All tiers exhausted for task='{task}'. Last error: {last_error}"
    ) from last_error


# ---------------------------------------------------------------------------
# Per-tier attempt with one validation retry
# ---------------------------------------------------------------------------

def _attempt_with_validation_retry[T: BaseModel](
    *,
    task: str,
    tier: str,
    model: str,
    messages: list[dict],
    schema: type[T],
    run_id: str | None,
    num_retries: int,
) -> T:
    """Call the model, validate, retry once on parse/validation error.

    ``num_retries`` is forwarded to the completion backend as the number of
    provider-level HTTP retries (LiteLLM ``num_retries`` parameter).  This is
    distinct from the single validation-feedback retry performed here.
    """
    timeout = _timeout_for_tier(tier)

    # --- First attempt ---
    t0 = time.perf_counter()
    response = _completion_backend(model=model, messages=messages, timeout=timeout, num_retries=num_retries)
    elapsed_ms = int((time.perf_counter() - t0) * 1000)

    raw_text = _extract_text(response)
    input_tok, output_tok, cost = _extract_usage(response)

    first_err: Exception | None = None
    try:
        validated = _parse_and_validate(raw_text, schema)
        _emit_tracking(
            task, model, run_id,
            status="ok",
            input_tokens=input_tok,
            output_tokens=output_tok,
            cost_usd=cost,
            latency_ms=elapsed_ms,
        )
        return validated
    except (json.JSONDecodeError, ValidationError) as exc:
        first_err = exc  # capture before except-block clears the binding (PEP 3110)
        log.info("llm_router: validation failed on first attempt (task=%s), retrying — %s", task, first_err)

    # --- Validation retry ---
    retry_messages = _build_validation_retry_message(messages, raw_text, str(first_err))
    t1 = time.perf_counter()
    retry_response = _completion_backend(model=model, messages=retry_messages, timeout=timeout, num_retries=num_retries)
    retry_ms = int((time.perf_counter() - t1) * 1000)

    retry_text = _extract_text(retry_response)
    r_in, r_out, r_cost = _extract_usage(retry_response)

    try:
        validated = _parse_and_validate(retry_text, schema)
        _emit_tracking(
            task, model, run_id,
            status="ok",
            input_tokens=input_tok + r_in,
            output_tokens=output_tok + r_out,
            cost_usd=cost + r_cost,
            latency_ms=elapsed_ms + retry_ms,
        )
        return validated
    except (json.JSONDecodeError, ValidationError) as retry_err:
        _emit_tracking(
            task, model, run_id,
            status="error",
            input_tokens=input_tok + r_in,
            output_tokens=output_tok + r_out,
            cost_usd=cost + r_cost,
            latency_ms=elapsed_ms + retry_ms,
        )
        raise ValidationRetryExhausted(
            f"Validation still failed after retry for task='{task}'. "
            f"Last error: {retry_err}"
        ) from retry_err


# ---------------------------------------------------------------------------
# Tracking helper
# ---------------------------------------------------------------------------

def _emit_tracking(
    task: str,
    model: str,
    run_id: str | None,
    *,
    status: str = "ok",
    input_tokens: int = 0,
    output_tokens: int = 0,
    cost_usd: float = 0.0,
    latency_ms: int = 0,
) -> None:
    """Best-effort: write to llm_calls.  Never raises."""
    try:
        from fi_ai.observability.llm_tracking import LlmCallRecord, record_llm_call  # late import

        rec = LlmCallRecord(
            task=task,
            model=model,
            status=status,  # type: ignore[arg-type]
            input_tokens=input_tokens or None,
            output_tokens=output_tokens or None,
            cost_usd=cost_usd or None,
            latency_ms=latency_ms or None,
            run_id=run_id,
        )
        record_llm_call(rec)
    except Exception:
        log.debug("llm_router: tracking emit failed", exc_info=True)
