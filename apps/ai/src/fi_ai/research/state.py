from enum import StrEnum


class RunState(StrEnum):
    CREATED = "created"
    SCOPING = "scoping"
    PLANNING = "planning"
    DISCOVERING = "discovering"
    FETCHING = "fetching"
    EXTRACTING = "extracting"
    CROSSCHECKING = "crosschecking"
    SYNTHESIZING = "synthesizing"
    RECOMMENDING = "recommending"
    COMPLETED = "completed"
    PARTIAL = "partial"      # budget/time exhausted but usable output exists
    FAILED = "failed"
    CANCELLED = "cancelled"


PIPELINE = [
    RunState.SCOPING, RunState.PLANNING, RunState.DISCOVERING, RunState.FETCHING,
    RunState.EXTRACTING, RunState.CROSSCHECKING, RunState.SYNTHESIZING, RunState.RECOMMENDING,
]
TERMINAL = {RunState.COMPLETED, RunState.PARTIAL, RunState.FAILED, RunState.CANCELLED}


def next_state(current: RunState) -> RunState:
    if current == RunState.CREATED:
        return PIPELINE[0]
    if current in TERMINAL:
        raise ValueError(f"{current} is terminal")
    i = PIPELINE.index(current)
    return PIPELINE[i + 1] if i + 1 < len(PIPELINE) else RunState.COMPLETED
