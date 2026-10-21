# Runbook: AI Token & Cost Spike Mitigation

## Overview

Founder Intelligence imposes strict token and dollar budget ceilings per research run tier:
- **Quick**: $1.00 ceiling
- **Standard**: $4.00 ceiling
- **Deep**: $12.00 ceiling

If actual spend exceeds these limits, or if daily organization spend anomalies occur, execute the procedures below.

---

## Symptoms & Alarms

- Langfuse or internal telemetry alerts on high token consumption rate.
- Research run cost tracking exceeds threshold for its configured tier.
- Provider bill projection exceeds monthly operating budget.

---

## Diagnostic Steps

### 1. Identify Expensive Research Runs
```sql
SELECT id, idea_id, status, created_at
FROM research_runs
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;
```

### 2. Query Langfuse / Observability Traces
- Check traces for looping or repeated calls in `crosscheck` or `synthesize` stages.
- Check context window sizes and prompt token counts.

### 3. Verify Cache Hit Rates
Ensure embedding and semantic cache hit rates in Redis are functioning.

---

## Mitigation Actions

### 1. Enforce Hard Run Budgets in Config
Adjust budget ceilings in `.env` if necessary:
```bash
RUN_BUDGET_USD_QUICK=0.75
RUN_BUDGET_USD_STANDARD=3.00
RUN_BUDGET_USD_DEEP=8.00
```

### 2. Restrict Concurrency
Limit the number of simultaneous research workers in Celery:
```bash
celery -A fi_ai.worker control autoscale 4,1
```

### 3. Temporary Fallback to Cost-Optimized Models
Switch fast model or summarization tasks strictly to lighter models:
```bash
LLM_FAST_MODEL=gpt-4o-mini
```
