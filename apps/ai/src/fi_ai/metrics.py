"""Prometheus metrics for AI research runs and LLM usage."""

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

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
