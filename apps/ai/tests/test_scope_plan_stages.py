
"""Unit tests for the Scope and Plan research pipeline stages."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from fi_ai.evidence.schemas import SourceType
from fi_ai.research.orchestrator import RunContext
from fi_ai.research.pipeline import plan, scope
from fi_ai.research.pipeline.repository import stable_question_id
from fi_ai.research.pipeline.schemas import (
    PlannedTask,
    PlanResult,
    ResearchQuestion,
    ScopeResult,
)

BRIEF_ID = "11111111-1111-4111-8111-111111111111"
RUN_ID = "22222222-2222-4222-8222-222222222222"

QUESTION_TEXT = "What is the market size for commercial HVAC automation?"
QUESTION_ID = stable_question_id(BRIEF_ID, QUESTION_TEXT)


def make_bundle() -> dict:
    """Return a representative research run and brief."""
    return {
        "run_id": RUN_ID,
        "brief_id": BRIEF_ID,
        "depth": "quick",
        "geography": ["US"],
        "budget_usd": 1.0,
        "spent_usd": 0.1,
        "available_budget_usd": 0.9,
        "problem": "Commercial HVAC dispatch inefficiency",
        "customer": "Commercial HVAC contractors",
        "category": "HVAC software",
        "alternatives": "Manual dispatch and legacy software",
        "business_model": "SaaS",
        "differentiation": "AI-assisted dispatch",
        "known_evidence": [],
        "unknowns": ["Market size"],
        "research_questions": [],
    }


def make_question() -> ResearchQuestion:
    """Return a valid Scope question."""
    return ResearchQuestion(
        question_id="rq_0123456789abcdef",
        question=QUESTION_TEXT,
        priority=5,
        required_source_classes=[
            SourceType.INDUSTRY_REPORT,
            SourceType.GOVERNMENT,
        ],
        evidence_target="Reliable market size estimates and industry statistics",
    )


def make_plan_task(budget: float = 0.25) -> PlannedTask:
    """Return a valid Plan task."""
    return PlannedTask(
        question_id=QUESTION_ID,
        task_type="search",
        query="US commercial HVAC automation market size industry report",
        source_class=SourceType.INDUSTRY_REPORT,
        priority=5,
        required_source_classes=[SourceType.INDUSTRY_REPORT],
        budget_usd=budget,
    )


def fake_prompt() -> SimpleNamespace:
    """Return a minimal prompt manifest for stage tests."""
    return SimpleNamespace(
        system="You are a research stage.",
        user_template="Research input: {{problem}}",
        task="test_task",
    )


def test_scope_generates_and_persists_questions(monkeypatch):
    repository = Mock()
    repository.load_run_bundle.return_value = make_bundle()

    saved = {}
    repository.save_scope_questions.side_effect = (
        lambda brief_id, questions: saved.update(
            {"brief_id": brief_id, "questions": questions}
        )
    )

    monkeypatch.setattr(scope, "ResearchRepository", lambda: repository)
    monkeypatch.setattr(scope, "load_prompt", lambda *_args: fake_prompt())
    monkeypatch.setattr(
        scope,
        "complete_structured",
        lambda **_kwargs: ScopeResult(questions=[make_question()]),
    )

    ctx = RunContext(RUN_ID)
    events = []
    ctx.publish = events.append

    scope.run(ctx)

    assert saved["brief_id"] == BRIEF_ID
    assert len(saved["questions"]) == 1
    assert saved["questions"][0]["question_id"] == QUESTION_ID
    assert ctx.budget_usd == 1.0
    assert ctx.spent_usd == 0.1
    assert events[0]["stage"] == "scope"
    assert events[0]["note"] == "questions_generated"


def test_scope_reuses_existing_questions_without_calling_llm(monkeypatch):
    bundle = make_bundle()
    question = make_question()
    question_data = question.model_dump(mode="json")
    question_data["question_id"] = stable_question_id(
        BRIEF_ID,
        question_data["question"],
    )
    bundle["research_questions"] = [question_data]

    repository = Mock()
    repository.load_run_bundle.return_value = bundle

    monkeypatch.setattr(scope, "ResearchRepository", lambda: repository)

    llm = Mock()
    monkeypatch.setattr(scope, "complete_structured", llm)

    ctx = RunContext(RUN_ID)
    events = []
    ctx.publish = events.append

    scope.run(ctx)

    llm.assert_not_called()
    repository.save_scope_questions.assert_not_called()
    assert events[0]["note"] == "reused_existing_questions"


def test_plan_generates_and_persists_tasks(monkeypatch):
    bundle = make_bundle()
    question = make_question()
    question_data = question.model_dump(mode="json")
    question_data["question_id"] = QUESTION_ID
    bundle["research_questions"] = [question_data]

    repository = Mock()
    repository.load_run_bundle.return_value = bundle
    repository.has_plan_tasks.return_value = False
    repository.save_plan_tasks.return_value = 1

    monkeypatch.setattr(plan, "ResearchRepository", lambda: repository)
    monkeypatch.setattr(plan, "load_prompt", lambda *_args: fake_prompt())
    monkeypatch.setattr(
        plan,
        "complete_structured",
        lambda **_kwargs: PlanResult(tasks=[make_plan_task()]),
    )

    ctx = RunContext(RUN_ID)
    events = []
    ctx.publish = events.append

    plan.run(ctx)

    repository.save_plan_tasks.assert_called_once()
    args = repository.save_plan_tasks.call_args.args

    assert args[0] == RUN_ID
    assert len(args[1]) == 1
    assert args[1][0]["question_id"] == QUESTION_ID
    assert args[1][0]["research_question"] == QUESTION_TEXT
    assert args[1][0]["task_key"]
    assert args[1][0]["source_class"] == "industry_report"
    assert events[0]["note"] == "tasks_persisted"
    assert events[0]["task_count"] == 1


def test_plan_rejects_budget_overflow(monkeypatch):
    bundle = make_bundle()
    question = make_question()
    question_data = question.model_dump(mode="json")
    question_data["question_id"] = QUESTION_ID
    bundle["research_questions"] = [question_data]

    repository = Mock()
    repository.load_run_bundle.return_value = bundle
    repository.has_plan_tasks.return_value = False

    monkeypatch.setattr(plan, "ResearchRepository", lambda: repository)
    monkeypatch.setattr(plan, "load_prompt", lambda *_args: fake_prompt())
    monkeypatch.setattr(
        plan,
        "complete_structured",
        lambda **_kwargs: PlanResult(tasks=[make_plan_task(budget=1.0)]),
    )

    with pytest.raises(ValueError, match="exceed"):
        plan.run(RunContext(RUN_ID))

    repository.save_plan_tasks.assert_not_called()


def test_plan_rejects_unknown_question_reference(monkeypatch):
    bundle = make_bundle()
    question = make_question()
    question_data = question.model_dump(mode="json")
    question_data["question_id"] = QUESTION_ID
    bundle["research_questions"] = [question_data]

    repository = Mock()
    repository.load_run_bundle.return_value = bundle
    repository.has_plan_tasks.return_value = False

    invalid_task = make_plan_task().model_copy(
        update={"question_id": "rq_aaaaaaaaaaaaaaaa"}
    )

    monkeypatch.setattr(plan, "ResearchRepository", lambda: repository)
    monkeypatch.setattr(plan, "load_prompt", lambda *_args: fake_prompt())
    monkeypatch.setattr(
        plan,
        "complete_structured",
        lambda **_kwargs: PlanResult(tasks=[invalid_task]),
    )

    with pytest.raises(ValueError, match="unknown question IDs"):
        plan.run(RunContext(RUN_ID))

    repository.save_plan_tasks.assert_not_called()


def test_plan_requires_scope_questions(monkeypatch):
    repository = Mock()
    repository.load_run_bundle.return_value = make_bundle()
    repository.has_plan_tasks.return_value = False

    monkeypatch.setattr(plan, "ResearchRepository", lambda: repository)

    with pytest.raises(ValueError, match="Scope has not persisted"):
        plan.run(RunContext(RUN_ID))

    repository.save_plan_tasks.assert_not_called()


def test_plan_retry_reuses_persisted_tasks_without_calling_llm(monkeypatch):
    """A retry must reuse persisted tasks instead of generating a new plan."""
    bundle = make_bundle()
    question = make_question()
    question_data = question.model_dump(mode="json")
    question_data["question_id"] = QUESTION_ID
    bundle["research_questions"] = [question_data]

    # Simulate a previous successful Plan attempt.
    repository = Mock()
    repository.load_run_bundle.return_value = bundle
    repository.has_plan_tasks.return_value = True

    monkeypatch.setattr(plan, "ResearchRepository", lambda: repository)

    llm = Mock()
    monkeypatch.setattr(plan, "complete_structured", llm)

    ctx = RunContext(RUN_ID)
    events = []
    ctx.publish = events.append

    plan.run(ctx)

    llm.assert_not_called()
    repository.save_plan_tasks.assert_not_called()
    repository.has_plan_tasks.assert_called_once_with(RUN_ID)
    assert events[0]["stage"] == "plan"
    assert events[0]["note"] == "reused_existing_tasks"
