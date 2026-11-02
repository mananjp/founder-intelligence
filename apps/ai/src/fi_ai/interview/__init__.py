"""Adaptive founder interview: state machine over missing variables -> ResearchBrief (Bible section 8).

Stateless: the caller (Node API / T4) owns all DB writes.  This module accepts the
full conversation history in each request, computes the next question via LiteLLM,
and returns the structured result.  It never reads from or writes to the database.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field

from fi_ai.llm.router import MissingApiKeyError, ProviderError, ValidationRetryExhausted, complete_structured

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Required ResearchBrief variables — must all be resolved before isComplete=True.
# These names match the keys used in the prompt and in T4's AiInterviewTurnResult.
# ---------------------------------------------------------------------------

REQUIRED_VARIABLES: list[str] = [
    "problem",
    "customer",
    "geography",
    "category",
    "alternatives",
    "businessModel",
    "differentiation",
]

# ---------------------------------------------------------------------------
# Pydantic schemas — field names and aliases match T4's TypeScript contract
# (packages/contracts/src/interview.ts → AiInterviewTurnResult).
# ---------------------------------------------------------------------------


class DraftBrief(BaseModel):
    """Mirrors the draftBrief shape in AiInterviewTurnResult."""

    problem: str | None = None
    customer: str | None = None
    geography: list[str] = Field(default_factory=list)
    category: str | None = None
    alternatives: str | None = None
    businessModel: str | None = None
    differentiation: str | None = None
    knownEvidence: list[Any] = Field(default_factory=list)
    unknowns: list[Any] = Field(default_factory=list)
    researchQuestions: list[Any] = Field(default_factory=list)


class AiTurnResponse(BaseModel):
    """LLM structured output — matches AiInterviewTurnResult from T4 contracts.

    Field names are camelCase to match the TypeScript contract.
    complete_structured validates this schema against the LLM's JSON response.
    """

    question: str
    extracted: dict[str, Any] = Field(default_factory=dict)
    isComplete: bool = False
    draftBrief: DraftBrief | None = None


# ---------------------------------------------------------------------------
# Prompt loading
# ---------------------------------------------------------------------------

_PROMPT_PATH = Path(__file__).parents[1] / "prompts" / "interview.v1.yaml"


def _load_prompt() -> dict:
    return yaml.safe_load(_PROMPT_PATH.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# Variable resolution helpers
# ---------------------------------------------------------------------------


def _resolved_variables(turn_history: list[dict]) -> dict[str, Any]:
    """Aggregate all variables extracted across the full turn history."""
    resolved: dict[str, Any] = {}
    for turn in turn_history:
        extracted = turn.get("extracted") or {}
        if isinstance(extracted, dict):
            resolved.update(extracted)
    return resolved


def _missing_variables(resolved: dict[str, Any]) -> list[str]:
    """Return required variables not yet present in resolved."""
    return [v for v in REQUIRED_VARIABLES if v not in resolved]


# ---------------------------------------------------------------------------
# Message building
# ---------------------------------------------------------------------------


def _format_turn_history(turn_history: list[dict]) -> str:
    """Format turn history as a readable dialogue string for the prompt."""
    if not turn_history:
        return "(no prior conversation)"
    lines: list[str] = []
    for turn in turn_history:
        role = turn.get("role", "unknown").capitalize()
        content = turn.get("content", "")
        lines.append(f"{role}: {content}")
    return "\n".join(lines)


def build_messages(payload: dict) -> list[dict]:
    """Build the LiteLLM messages list from the request payload.

    Returns a two-element list: [system, user] matching the prompt template.
    """
    prompt = _load_prompt()
    turn_history = payload.get("turnHistory") or []
    resolved = _resolved_variables(turn_history)
    missing = _missing_variables(resolved)

    geography_raw = payload.get("geography") or []
    geography_str = ", ".join(geography_raw) if geography_raw else "not specified"

    resolved_str = (
        "\n".join(f"  {k}: {v}" for k, v in resolved.items())
        if resolved
        else "  (none yet)"
    )
    missing_str = ", ".join(missing) if missing else "(all resolved)"

    user_content = prompt["user_template"].format(
        idea_title=payload.get("ideaTitle", ""),
        raw_description=payload.get("rawDescription", ""),
        geography=geography_str,
        resolved_variables=resolved_str,
        missing_variables=missing_str,
        turn_history=_format_turn_history(turn_history),
        founder_message=payload.get("founderMessage", ""),
    )

    return [
        {"role": "system", "content": prompt["system"]},
        {"role": "user", "content": user_content},
    ]


# ---------------------------------------------------------------------------
# Core entry point — stateless, no DB access
# ---------------------------------------------------------------------------


def run_interview_turn(payload: dict, run_id: str | None = None) -> AiTurnResponse:
    """Run one adaptive interview turn.

    Accepts the full request payload from POST /internal/interview/turn.
    Calls complete_structured("interview_turn", ...) via T11 router.
    Returns AiTurnResponse — never raises for LLM failures; converts them to
    a safe fallback response so the Node API always gets a usable result.

    Raises:
        MissingApiKeyError: propagated — environment is misconfigured, not retryable.
        ValueError: propagated — invalid request payload.
    """
    messages = build_messages(payload)

    try:
        result = complete_structured("interview_turn", messages, AiTurnResponse, run_id)
    except MissingApiKeyError:
        raise  # environment misconfiguration — must surface to the caller
    except (ProviderError, ValidationRetryExhausted) as exc:
        log.warning("interview_turn: LLM failed after retries — %s", exc)
        # Return a safe degraded response rather than 500-ing the Node API.
        # The Node API has its own fake-AI fallback (interview.fakeAi.ts) for
        # exactly this scenario, but we still return a structured error signal.
        return AiTurnResponse(
            question="I'm having trouble processing your response right now. Could you please repeat your last answer?",
            extracted={},
            isComplete=False,
        )

    # ------------------------------------------------------------------
    # Server-side completion guard.
    # The LLM controls isComplete, but we validate the claim deterministically.
    # If required variables are still missing after merging prior history with
    # this turn's extracted values, we downgrade isComplete to False and clear
    # draftBrief.  This prevents a brief being marked complete too early.
    # ------------------------------------------------------------------
    if result.isComplete:
        turn_history = payload.get("turnHistory") or []
        all_resolved = _resolved_variables(turn_history)
        all_resolved.update(result.extracted)   # include this turn's new extractions
        still_missing = _missing_variables(all_resolved)
        if still_missing:
            log.info(
                "interview_turn: LLM set isComplete=True but %d variable(s) still missing: %s — downgrading",
                len(still_missing),
                still_missing,
            )
            result = result.model_copy(update={"isComplete": False, "draftBrief": None})

    return result
