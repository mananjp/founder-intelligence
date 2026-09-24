"""Research orchestrator: runs stages in order, checkpoints after each, enforces budget, emits progress events.

Every stage must be idempotent: re-running a stage for the same run_id must not duplicate rows
(use natural keys such as (run_id, url_hash) and UPSERT).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Protocol

import structlog

from fi_ai.research.state import TERMINAL, RunState, next_state

log = structlog.get_logger()


class RunContext:
    """Loaded per run: brief, geography, depth, budget tracker, db session, event publisher."""

    def __init__(self, run_id: str) -> None:
        self.run_id = run_id
        self.spent_usd = 0.0
        self.budget_usd = 1.0  # TODO load from depth tier

    def publish(self, event: dict) -> None:  # TODO: redis.publish(f"run:{self.run_id}", json.dumps(event))
        log.info("run.event", run_id=self.run_id, **event)

    def over_budget(self) -> bool:
        return self.spent_usd >= self.budget_usd


class Stage(Protocol):
    def __call__(self, ctx: RunContext) -> None: ...


def _registry() -> dict[RunState, Callable[[RunContext], None]]:
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

    return {
        RunState.SCOPING: scope.run,
        RunState.PLANNING: plan.run,
        RunState.DISCOVERING: discover.run,
        RunState.FETCHING: fetch.run,
        RunState.EXTRACTING: extract.run,
        RunState.CROSSCHECKING: crosscheck.run,
        RunState.SYNTHESIZING: synthesize.run,
        RunState.RECOMMENDING: recommend.run,
    }


class Orchestrator:
    def __init__(self, run_id: str) -> None:
        self.ctx = RunContext(run_id)

    def execute(self) -> RunState:
        stages = _registry()
        state = RunState.CREATED  # TODO: load persisted state so a retry resumes at the failed stage
        while state not in TERMINAL:
            state = next_state(state)
            if state in TERMINAL:
                break
            if self.ctx.over_budget():
                state = RunState.PARTIAL
                break
            self.ctx.publish({"type": "stage.started", "stage": state.value})
            try:
                stages[state](self.ctx)
            except Exception as exc:
                log.exception("stage.failed", stage=state.value)
                self.ctx.publish({"type": "stage.failed", "stage": state.value, "error": str(exc)})
                state = RunState.FAILED
                break
            self.ctx.publish({"type": "stage.completed", "stage": state.value})
            # TODO: persist state + checkpoint to research_runs
        self.ctx.publish({"type": "run.finished", "state": state.value})
        return state
