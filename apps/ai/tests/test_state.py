from fi_ai.research.state import RunState, next_state


def test_pipeline_walks_to_completed():
    s = RunState.CREATED
    seen = []
    while s != RunState.COMPLETED:
        s = next_state(s)
        seen.append(s)
    assert seen[0] == RunState.SCOPING and seen[-1] == RunState.COMPLETED
