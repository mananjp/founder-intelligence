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


def test_pipeline_stages_publish_progress_events():
    ctx = RunContext("run-1")
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
def test_individual_pipeline_stage_runs(module, expected_stage):
    ctx = RunContext("run-test")
    events = []
    ctx.publish = events.append

    module.run(ctx)

    assert len(events) == 1
    assert events[0] == {
        "type": "stage.progress",
        "stage": expected_stage,
        "note": "stub",
    }
