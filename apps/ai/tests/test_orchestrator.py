from unittest.mock import patch

from fi_ai.research.orchestrator import Orchestrator, RunContext, _registry
from fi_ai.research.state import RunState


def test_context_budget_boundary():
    ctx = RunContext("run-1")

    assert ctx.over_budget() is False
    ctx.spent_usd = ctx.budget_usd
    assert ctx.over_budget() is True


def test_context_publishes_event():
    ctx = RunContext("run-1")

    ctx.publish({"type": "test"})


def test_registry_has_each_pipeline_stage():
    registry = _registry()

    assert set(registry) == {
        RunState.SCOPING,
        RunState.PLANNING,
        RunState.DISCOVERING,
        RunState.FETCHING,
        RunState.EXTRACTING,
        RunState.CROSSCHECKING,
        RunState.SYNTHESIZING,
        RunState.RECOMMENDING,
    }


def test_execute_runs_all_stages_to_completion():
    orchestrator = Orchestrator("run-1")
    events = []
    orchestrator.ctx.publish = events.append
    stages = {state: lambda _ctx: None for state in _registry()}

    with patch("fi_ai.research.orchestrator._registry", return_value=stages):
        result = orchestrator.execute()

    assert result == RunState.COMPLETED
    assert events[-1] == {"type": "run.finished", "state": "completed"}


def test_execute_stops_when_budget_is_exhausted():
    orchestrator = Orchestrator("run-1")
    orchestrator.ctx.spent_usd = orchestrator.ctx.budget_usd
    events = []
    orchestrator.ctx.publish = events.append

    result = orchestrator.execute()

    assert result == RunState.PARTIAL
    assert events == [{"type": "run.finished", "state": "partial"}]


def test_execute_marks_failed_stage():
    orchestrator = Orchestrator("run-1")
    events = []
    orchestrator.ctx.publish = events.append
    stages = {state: lambda _ctx: None for state in _registry()}
    stages[RunState.SCOPING] = lambda _ctx: (_ for _ in ()).throw(RuntimeError("stage failure"))

    with patch("fi_ai.research.orchestrator._registry", return_value=stages):
        result = orchestrator.execute()

    assert result == RunState.FAILED
    assert events[-1] == {"type": "run.finished", "state": "failed"}
