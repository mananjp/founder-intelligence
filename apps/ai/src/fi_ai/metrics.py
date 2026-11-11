"""Prometheus metrics for AI research runs and LLM usage."""

from prometheus_client import Counter, Gauge, Histogram, generate_latest

STAGE_DURATION_SECONDS = Histogram(
    "fi_ai_stage_duration_seconds",
    "Wall-clock time spent executing a research pipeline stage, in seconds.",
    labelnames=("stage",),
)
RUNS_TOTAL = Counter(
    "fi_ai_runs",
    "Research runs completed by terminal state.",
    labelnames=("state",),
)
LLM_TOKENS_TOTAL = Counter(
    "fi_ai_llm_tokens",
    "LLM tokens consumed, split by prompt and completion tokens.",
    labelnames=("task", "model", "token_type"),
)
LLM_COST_USD_TOTAL = Counter(
    "fi_ai_llm_cost_usd",
    "Cumulative LLM cost in US dollars.",
    labelnames=("task", "model"),
)
BUDGET_EXCEEDED_TOTAL = Counter(
    "fi_ai_budget_exceeded",
    "Research runs stopped because their configured budget was exhausted.",
)

# --- quote verbatim gate metric -------------------------------------------

QUOTE_VERBATIM_EVALUATED_TOTAL = Counter(
    "fi_ai_quote_verbatim_evaluated_total",
    "Non-empty quotes evaluated by the verbatim gate (metric denominator).",
    labelnames=("stage",),
)
QUOTE_VERBATIM_ACCEPTED_TOTAL = Counter(
    "fi_ai_quote_verbatim_accepted_total",
    "Quotes accepted by the verbatim gate (metric numerator).",
    labelnames=("stage",),
)
QUOTE_VERBATIM_RATE = Gauge(
    "fi_ai_quote_verbatim_rate",
    "quote_verbatim_rate = accepted / evaluated for the most recent extract "
    "stage. Unset when no quotes were evaluated (never reported as 100%).",
    labelnames=("stage",),
)


def quote_verbatim_rate(*, accepted: int, evaluated: int) -> float | None:
    """Compute ``accepted / evaluated``.

    Returns ``None`` when nothing was evaluated -- an empty dataset is
    explicitly not 1.0, and a missing metric must never be reported as 100%.
    """
    if evaluated == 0:
        return None
    return accepted / evaluated


def record_quote_verbatim_rate(
    *,
    accepted: int,
    evaluated: int,
    stage: str = "extract",
) -> float | None:
    """Record the verbatim gate outcome for one stage and return the rate.

    Increments the evaluated/accepted counters and updates the rate gauge.
    Only sets the gauge when at least one quote was evaluated.
    """
    QUOTE_VERBATIM_EVALUATED_TOTAL.labels(stage=stage).inc(evaluated)
    QUOTE_VERBATIM_ACCEPTED_TOTAL.labels(stage=stage).inc(accepted)
    rate = quote_verbatim_rate(accepted=accepted, evaluated=evaluated)
    if rate is not None:
        QUOTE_VERBATIM_RATE.labels(stage=stage).set(rate)
    return rate


def observe_stage_duration(stage: str, duration_seconds: float) -> None:
    """Record the execution time for one stage, including failed stage attempts."""
    STAGE_DURATION_SECONDS.labels(stage=stage).observe(max(0.0, float(duration_seconds)))


def record_run_state(state: str) -> None:
    """Increment the number of runs that reached a terminal state."""
    RUNS_TOTAL.labels(state=state).inc()


def record_budget_exceeded() -> None:
    """Count a run that stopped because its budget was exhausted."""
    BUDGET_EXCEEDED_TOTAL.inc()


def record_llm_usage(
    *,
    task: str,
    model: str,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    cost_usd: float = 0.0,
) -> None:
    """Record usage from an LLM provider response without high-cardinality run labels.

    Call this once for each provider attempt when its token and cost usage is available.
    """
    LLM_TOKENS_TOTAL.labels(task=task, model=model, token_type="prompt").inc(max(0, int(prompt_tokens)))
    LLM_TOKENS_TOTAL.labels(task=task, model=model, token_type="completion").inc(
        max(0, int(completion_tokens))
    )
    LLM_COST_USD_TOTAL.labels(task=task, model=model).inc(max(0.0, float(cost_usd)))


def generate_metrics() -> bytes:
    """Return the current process metrics in Prometheus text exposition format."""
    return generate_latest()
