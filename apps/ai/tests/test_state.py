import pytest

from fi_ai.research.state import RunState, next_state


def test_pipeline_walks_to_completed():
    s = RunState.CREATED
    seen = []
    while s != RunState.COMPLETED:
        s = next_state(s)
        seen.append(s)
    assert seen[0] == RunState.SCOPING and seen[-1] == RunState.COMPLETED


@pytest.mark.parametrize(
    "state",
    [RunState.COMPLETED, RunState.PARTIAL, RunState.FAILED, RunState.CANCELLED],
)
def test_terminal_states_cannot_advance(state):
    with pytest.raises(ValueError, match="is terminal"):
        next_state(state)


def test_recommendation_advances_to_completed():
    assert next_state(RunState.RECOMMENDING) == RunState.COMPLETED
