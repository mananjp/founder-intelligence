
"""Stage: Scope — convert a research brief into prioritized questions."""

from __future__ import annotations

import json
from typing import Any

from pydantic import ValidationError

from fi_ai.llm.router import complete_structured
from fi_ai.prompts.registry import load_prompt
from fi_ai.research.orchestrator import RunContext
from fi_ai.research.pipeline.repository import (
    ResearchRepository,
    stable_question_id,
)
from fi_ai.research.pipeline.schemas import ScopeResult


def _render_template(template: str, values: dict[str, Any]) -> str:
    """Replace prompt placeholders with JSON-safe values."""
    rendered = template

    for key, value in values.items():
        if isinstance(value, (dict, list)):
            replacement = json.dumps(value, ensure_ascii=False, default=str)
        else:
            replacement = str(value if value is not None else "")

        rendered = rendered.replace("{{" + key + "}}", replacement)

    return rendered


def _existing_scope_questions(
    questions: list[Any],
    brief_id: str,
) -> list[dict[str, Any]] | None:
    """Return valid persisted Scope questions, if available."""
    if not questions or not all(isinstance(item, dict) for item in questions):
        return None

    try:
        result = ScopeResult.model_validate({"questions": questions})
    except ValidationError:
        return None

    normalized = []

    for question in result.questions:
        item = question.model_dump(mode="json")
        item["question_id"] = stable_question_id(brief_id, item["question"])
        normalized.append(item)

    return normalized


def run(ctx: RunContext) -> None:
    """Execute Scope and persist questions to the linked research brief."""
    repository = ResearchRepository()
    bundle = repository.load_run_bundle(ctx.run_id)

    ctx.budget_usd = bundle["budget_usd"]
    ctx.spent_usd = bundle["spent_usd"]

    brief_id = str(bundle["brief_id"])

    existing = _existing_scope_questions(
        bundle["research_questions"],
        brief_id,
    )

    if existing is not None:
        ctx.publish(
            {
                "type": "stage.progress",
                "stage": "scope",
                "note": "reused_existing_questions",
                "question_count": len(existing),
            }
        )
        return

    prompt = load_prompt("scope", 1)

    prompt_values = {
        "problem": bundle["problem"],
        "customer": bundle["customer"],
        "geography": bundle["geography"],
        "category": bundle["category"],
        "alternatives": bundle["alternatives"],
        "business_model": bundle["business_model"],
        "differentiation": bundle["differentiation"],
        "known_evidence": bundle["known_evidence"],
        "unknowns": bundle["unknowns"],
        "existing_research_questions": bundle["research_questions"],
        "depth": bundle["depth"],
    }

    messages = [
        {"role": "system", "content": prompt.system},
        {
            "role": "user",
            "content": _render_template(prompt.user_template, prompt_values),
        },
    ]

    result = complete_structured(
        task=prompt.task,
        messages=messages,
        schema=ScopeResult,
        run_id=ctx.run_id,
    )

    questions = []

    for question in result.questions:
        item = question.model_dump(mode="json")
        item["question_id"] = stable_question_id(brief_id, item["question"])
        questions.append(item)

    validated = ScopeResult.model_validate({"questions": questions})

    repository.save_scope_questions(
        brief_id,
        [item.model_dump(mode="json") for item in validated.questions],
    )

    ctx.publish(
        {
            "type": "stage.progress",
            "stage": "scope",
            "note": "questions_generated",
            "question_count": len(validated.questions),
        }
    )
