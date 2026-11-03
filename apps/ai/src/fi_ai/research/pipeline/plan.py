
"""Stage: Plan — convert research questions into budgeted research tasks."""

from __future__ import annotations

import json
from typing import Any

from fi_ai.llm.router import complete_structured
from fi_ai.prompts.registry import load_prompt
from fi_ai.research.orchestrator import RunContext
from fi_ai.research.pipeline.repository import (
    ResearchRepository,
    stable_task_key,
)
from fi_ai.research.pipeline.schemas import PlanResult, ScopeResult


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


def run(ctx: RunContext) -> None:
    """Generate and persist research tasks for the current run."""
    repository = ResearchRepository()
    bundle = repository.load_run_bundle(ctx.run_id)

    ctx.budget_usd = bundle["budget_usd"]
    ctx.spent_usd = bundle["spent_usd"]

    # A successful task insert is transactional. If tasks already exist,
    # reuse them instead of generating a different plan on a retry.
    if repository.has_plan_tasks(ctx.run_id):
        ctx.publish(
            {
                "type": "stage.progress",
                "stage": "plan",
                "note": "reused_existing_tasks",
            }
        )
        return

    raw_questions = bundle["research_questions"]

    if not raw_questions:
        raise ValueError(
            "Plan cannot run because Scope has not persisted research questions"
        )

    scope_result = ScopeResult.model_validate({"questions": raw_questions})
    question_by_id = {
        question.question_id: question
        for question in scope_result.questions
    }

    available_budget = bundle["available_budget_usd"]

    if available_budget <= 0:
        raise ValueError("No remaining research budget is available for planning")

    prompt = load_prompt("plan", 1)

    prompt_values = {
        "questions": [
            question.model_dump(mode="json")
            for question in scope_result.questions
        ],
        "geography": bundle["geography"],
        "depth": bundle["depth"],
        "available_budget_usd": available_budget,
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
        schema=PlanResult,
        run_id=ctx.run_id,
    )

    valid_question_ids = set(question_by_id)
    result.validate_question_references(valid_question_ids)
    result.validate_total_budget(available_budget)

    tasks = []

    for task in result.tasks:
        question = question_by_id[task.question_id]

        task_data = task.model_dump(mode="json")
        task_data["research_question"] = question.question
        task_data["task_key"] = stable_task_key(
            task.question_id,
            task.task_type,
            task.source_class.value,
            task.query,
        )
        task_data["required_source_classes"] = [
            source.value for source in task.required_source_classes
        ]
        task_data["source_class"] = task.source_class.value
        task_data["metadata"] = {
            "research_depth": bundle["depth"],
            "geography": bundle["geography"],
        }

        tasks.append(task_data)

    inserted = repository.save_plan_tasks(ctx.run_id, tasks)

    ctx.publish(
        {
            "type": "stage.progress",
            "stage": "plan",
            "note": "tasks_persisted",
            "task_count": inserted,
            "task_budget_usd": round(
                sum(task["budget_usd"] for task in tasks), 2
            ),
            "available_budget_usd": round(available_budget, 2),
        }
    )
