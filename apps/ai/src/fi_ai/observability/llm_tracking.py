"""Cost accounting: write one row to llm_calls after every LLM call.

Mirrors db/migrations/005_llm_observability.sql exactly.
Uses the shared async SQLAlchemy engine from fi_ai.db.
Falls back to a best-effort fire-and-forget: if the DB write fails we log
the error but do NOT surface it to the caller — a tracking failure must never
break inference.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import text

log = logging.getLogger(__name__)

# Status values that mirror the llm_calls.status CHECK in the schema.
LlmCallStatus = Literal["ok", "error", "timeout"]


@dataclass
class LlmCallRecord:
    """Structured representation of one row in llm_calls."""

    task: str
    model: str
    status: LlmCallStatus = "ok"
    input_tokens: int | None = None
    output_tokens: int | None = None
    cost_usd: float | None = None
    latency_ms: int | None = None
    run_id: str | None = None


_INSERT_SQL = text(
    """
    INSERT INTO llm_calls
        (run_id, task, model, input_tokens, output_tokens, cost_usd, latency_ms, status)
    VALUES
        (:run_id, :task, :model, :input_tokens, :output_tokens, :cost_usd, :latency_ms, :status)
    """
)


def record_llm_call(rec: LlmCallRecord) -> None:
    """Fire-and-forget: persist *rec* to llm_calls.

    Runs the async DB write in whatever event loop is available.
    If no loop is running we schedule a new one in a best-effort manner.
    Never raises — a tracking failure must not propagate to the caller.
    """
    try:
        _schedule(rec)
    except Exception:
        log.warning("llm_tracking: failed to schedule DB write", exc_info=True)


def _schedule(rec: LlmCallRecord) -> None:
    """Route the coroutine to the correct event-loop context."""
    try:
        loop = asyncio.get_running_loop()
        # We are inside an async context; schedule as a background task.
        loop.create_task(_write(rec))
    except RuntimeError:
        # No running loop — run synchronously in a new loop.
        asyncio.run(_write(rec))


async def _write(rec: LlmCallRecord) -> None:
    """Execute the INSERT.  Swallows all DB-level exceptions."""
    try:
        from fi_ai.db import engine  # late import to keep module importable standalone

        async with engine.begin() as conn:
            await conn.execute(
                _INSERT_SQL,
                {
                    "run_id": rec.run_id,
                    "task": rec.task,
                    "model": rec.model,
                    "input_tokens": rec.input_tokens,
                    "output_tokens": rec.output_tokens,
                    "cost_usd": rec.cost_usd,
                    "latency_ms": rec.latency_ms,
                    "status": rec.status,
                },
            )
    except Exception:
        log.warning("llm_tracking: DB write failed for task=%s model=%s", rec.task, rec.model, exc_info=True)
