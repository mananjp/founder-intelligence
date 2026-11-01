# Runbook: AI Service Prometheus Metrics

## Endpoint

The AI service exposes Prometheus text exposition at `GET /metrics`. It is intended for scraping by the deployment's Prometheus-compatible collector; it is excluded from the interactive FastAPI schema. Scrape each running AI API process directly. Metrics are process-local and reset when that process restarts.

## Metric catalogue

| Metric | Type | Labels | Meaning |
|---|---|---|---|
| `fi_ai_stage_duration_seconds` | Histogram | `stage` | Wall-clock stage execution duration in seconds. `_bucket`, `_sum`, and `_count` series are exported. Failed attempts are timed too. |
| `fi_ai_runs_total` | Counter | `state` | Number of research runs reaching each terminal state (for example `completed`, `partial`, or `failed`). |
| `fi_ai_llm_tokens_total` | Counter | `task`, `model`, `token_type` | Cumulative token count, with `token_type` equal to `prompt` or `completion`. |
| `fi_ai_llm_cost_usd_total` | Counter | `task`, `model` | Cumulative provider-reported LLM cost in USD. |
| `fi_ai_budget_exceeded_total` | Counter | none | Runs stopped because the run budget was exhausted. |

`record_llm_usage(...)` is the instrumentation hook for an LLM provider response. Call it once per provider attempt after the provider supplies the task, model, prompt tokens, completion tokens, and cost. The current `fi_ai.llm.router.complete_structured` is still a TODO stub, so these two LLM usage counters remain zero until the router's provider call path records usage.

Do not add `run_id`, user IDs, request IDs, or other unbounded values as metric labels: they create unbounded time-series cardinality. Keep task and model labels to known task/model identifiers.

## Example PromQL

Average stage duration by stage over the last five minutes:

```promql
rate(fi_ai_stage_duration_seconds_sum[5m])
/
rate(fi_ai_stage_duration_seconds_count[5m])
```

Terminal run rate by state:

```promql
sum by (state) (rate(fi_ai_runs_total[5m]))
```

Tokens consumed by task, model, and token type:

```promql
sum by (task, model, token_type) (increase(fi_ai_llm_tokens_total[1h]))
```

LLM spend by task and model in the last hour:

```promql
sum by (task, model) (increase(fi_ai_llm_cost_usd_total[1h]))
```

Budget-exceeded events in the last hour:

```promql
increase(fi_ai_budget_exceeded_total[1h])
```

## Troubleshooting

- A missing `/metrics` response usually means the scrape target or service route is wrong; confirm `GET /health` also responds.
- An absent stage/state series indicates that the process has not observed that stage/state since startup. A zero counter is not a historical total across restarts.
- Empty LLM token/cost series are expected until the LLM router's provider-call implementation invokes `record_llm_usage` with provider-reported usage.
