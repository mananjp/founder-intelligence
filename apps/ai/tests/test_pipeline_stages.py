
"""Tests for research pipeline stage progress events."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from fi_ai.research.orchestrator import RunContext, _registry
from fi_ai.research.pipeline import (
    crosscheck,
    discover,
    extract,
    fetch,
    plan,
    recommend,
    scope,
    synthesize,
)
from fi_ai.research.state import RunState

RUN_ID = "22222222-2222-4222-8222-222222222222"
BRIEF_ID = "11111111-1111-4111-8111-111111111111"


def make_bundle() -> dict:
    """Return a minimal valid research bundle for Scope and Plan."""
    return {
        "run_id": RUN_ID,
        "brief_id": BRIEF_ID,
        "depth": "quick",
        "geography": ["US"],
        "budget_usd": 1.0,
        "spent_usd": 0.0,
        "available_budget_usd": 1.0,
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


def fake_prompt() -> SimpleNamespace:
    """Return a minimal prompt manifest for stage tests."""
    return SimpleNamespace(
        system="You are a research stage.",
        user_template="Research input: {{problem}}",
        task="test_task",
    )


def configure_scope(monkeypatch) -> None:
    """Mock Scope dependencies so tests do not require a real database or LLM."""
    repository = Mock()
    repository.load_run_bundle.return_value = make_bundle()
    repository.save_scope_questions.return_value = None

    question = {
        "question_id": "rq_0123456789abcdef",
        "question": "What is the market size for commercial HVAC automation?",
        "priority": 5,
        "required_source_classes": ["industry_report", "government"],
        "evidence_target": "Reliable market size estimates and industry statistics",
    }

    result = SimpleNamespace(questions=[SimpleNamespace(
        model_dump=lambda mode="python": question
    )])

    monkeypatch.setattr(scope, "ResearchRepository", lambda: repository)
    monkeypatch.setattr(scope, "load_prompt", lambda *_args: fake_prompt())
    monkeypatch.setattr(scope, "complete_structured", lambda **_kwargs: result)


def configure_plan(monkeypatch) -> None:
    """Mock Plan dependencies so tests do not require a real database or LLM."""
    from fi_ai.evidence.schemas import SourceType
    from fi_ai.research.pipeline.schemas import PlannedTask, PlanResult

    bundle = make_bundle()
    bundle["research_questions"] = [
        {
            "question_id": "rq_0123456789abcdef",
            "question": "What is the market size for commercial HVAC automation?",
            "priority": 5,
            "required_source_classes": ["industry_report", "government"],
            "evidence_target": "Reliable market size estimates and industry statistics",
        }
    ]

    repository = Mock()
    repository.load_run_bundle.return_value = bundle
    repository.save_plan_tasks.return_value = 1

    task = PlannedTask(
        question_id="rq_0123456789abcdef",
        task_type="search",
        query="US commercial HVAC automation market size",
        source_class=SourceType.INDUSTRY_REPORT,
        priority=5,
        required_source_classes=[SourceType.INDUSTRY_REPORT],
        budget_usd=0.25,
    )

    monkeypatch.setattr(plan, "ResearchRepository", lambda: repository)
    monkeypatch.setattr(plan, "load_prompt", lambda *_args: fake_prompt())
    monkeypatch.setattr(
        plan,
        "complete_structured",
        lambda **_kwargs: PlanResult(tasks=[task]),
    )


def configure_stage(module, monkeypatch) -> None:
    """Configure real Scope and Plan stages with mocked external dependencies."""
    if module is scope:
        configure_scope(monkeypatch)
    elif module is plan:
        configure_plan(monkeypatch)


def test_pipeline_stages_publish_progress_events(monkeypatch):
    configure_scope(monkeypatch)
    configure_plan(monkeypatch)

    ctx = RunContext(RUN_ID)
    events = []
    ctx.publish = events.append

    for stage in _registry().values():
        stage(ctx)

    assert len(events) == len(RunState) - 5
    assert all(event["type"] == "stage.progress" for event in events)
    assert {event["stage"] for event in events} == {
        "scope",
        "plan",
        "discover",
        "fetch",
        "extract",
        "crosscheck",
        "synthesize",
        "recommend",
    }


@pytest.mark.parametrize(
    ("module", "expected_stage"),
    [
        (scope, "scope"),
        (plan, "plan"),
        (discover, "discover"),
        (fetch, "fetch"),
        (extract, "extract"),
        (crosscheck, "crosscheck"),
        (synthesize, "synthesize"),
        (recommend, "recommend"),
    ],
)
def test_individual_pipeline_stage_runs(module, expected_stage, monkeypatch):
    configure_stage(module, monkeypatch)

    ctx = RunContext(RUN_ID)
    events = []
    ctx.publish = events.append

    module.run(ctx)

    assert len(events) == 1
    assert events[0]["type"] == "stage.progress"
    assert events[0]["stage"] == expected_stage
