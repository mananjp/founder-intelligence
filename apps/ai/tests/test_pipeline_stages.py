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


def test_pipeline_stages_publish_progress_events():
    ctx = RunContext("run-1")
    events = []
    ctx.publish = events.append

    for stage in _registry().values():
        stage(ctx)

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


def test_recommend_stage_publishes_progress_event(monkeypatch):
    """recommend.run() publishes at least one stage.progress event without error.

    When ctx.idea_id is None (T15 pending) the stage exits early after publishing
    idea_id_unavailable — this is the expected behaviour until T15 lands.
    The LLM is not called in this path.
    """
    ctx = RunContext("run-test")
    events = []
    ctx.publish = events.append

    recommend.run(ctx)

    assert len(events) >= 1
    assert all(e["type"] == "stage.progress" for e in events)
    assert all(e["stage"] == "recommend" for e in events)
    notes = {e.get("note") for e in events}
    # idea_id is None → early exit with this note
    assert "idea_id_unavailable" in notes
