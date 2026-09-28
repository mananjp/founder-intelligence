from fi_ai.research.orchestrator import RunContext, _registry
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
