# Runbook: LLM Provider Outage & Failover

## Overview

Founder Intelligence relies on LLM providers (OpenAI, Anthropic) for hypothesis scoping, entity extraction, claim verification, and synthesis. This runbook details how to handle major latency spikes, rate limit exhaustion (HTTP 429), or complete provider outages.

---

## Symptoms & Trigger Thresholds

- Error rate > 5% on AI synthesis or extraction stages.
- Consecutive `HTTP 502/503/504` responses from OpenAI / Anthropic APIs in `fi-ai` logs.
- Prolonged latency exceeding 60s per model inference call.

---

## Architecture & Router Behavior

The AI service uses `fi_ai.llm.router.ModelRouter` with fallback chains:
- **Fast Tier**: `gpt-4o-mini` → `claude-3-5-haiku`
- **Strong Tier**: `gpt-4o` → `claude-3-5-sonnet`
- **Embeddings**: `text-embedding-3-small`

---

## Diagnostic Steps

### 1. Check Upstream Status
- OpenAI Status: [status.openai.com](https://status.openai.com)
- Anthropic Status: [status.anthropic.com](https://status.anthropic.com)

### 2. Inspect Error Signatures in Logs
```bash
docker compose logs --tail=100 fi-ai | grep -E "rate_limit|overloaded|InternalServerError|timeout"
```

### 3. Check Active Rate Limits
Verify whether our organization quota has been reached on the provider dashboard.

---

## Mitigation & Failover Actions

### Scenario A: Primary Provider Outage (e.g. OpenAI Down)
Switch default models to the fallback provider (Anthropic) via environment variables:

1. Update `.env` or deployment configuration:
   ```bash
   LLM_FAST_MODEL=claude-3-5-haiku-20241022
   LLM_STRONG_MODEL=claude-3-5-sonnet-20241022
   ```

2. Restart AI services:
   ```bash
   docker compose restart fi-ai fi-worker
   ```

### Scenario B: Severe Search Provider Outage (Tavily Down)
Switch search provider from `tavily` to `exa`:
```bash
SEARCH_PROVIDER=exa
```
Restart worker processes:
```bash
docker compose restart fi-worker
```

### Scenario C: Rate Limit Throttle
Reduce concurrent research run workers or throttle incoming runs:
```bash
celery -A fi_ai.worker control rate_limit run_research 10/m
```
