# Runbook: Research Run Stuck

## Overview

A research run transitions through stages: `created` → `scoping` → `planning` → `discovering` → `fetching` → `extracting` → `crosschecking` → `synthesizing` → `recommending` → `completed`. If a run remains in an intermediate state for longer than 15 minutes (or 30 minutes for deep research runs), it is classified as stuck.

---

## Symptoms & Detection

- Alerts firing from Celery worker queue depth or latency metrics.
- User report: UI progress spinner on `/workspace/:workspaceId/ideas/:ideaId/research-live` is halted on a single stage.
- Querying `research_runs` table shows `status NOT IN ('completed', 'failed', 'cancelled')` and `updated_at < NOW() - INTERVAL '15 minutes'`.

---

## Diagnostic Steps

### 1. Identify the Stuck Run
```sql
SELECT id, idea_id, status, error, created_at, updated_at
FROM research_runs
WHERE status NOT IN ('completed', 'failed', 'cancelled')
  AND updated_at < NOW() - INTERVAL '15 minutes'
ORDER BY created_at DESC;
```

### 2. Inspect Celery Worker Logs
Look for the active task handling the `run_id`:
```bash
docker compose logs --tail=200 fi-worker | grep "<run-id>"
```
Or in Kubernetes / Render:
```bash
kubectl logs deployment/fi-ai-worker | grep "<run-id>"
```

### 3. Check Redis Task Queue
Verify if the Celery task is currently reserved, running, or stalled:
```bash
docker compose exec redis redis-cli keys "celery*"
docker compose exec redis redis-cli llen celery
```

### 4. Check LLM Provider & Search Outages
Check if the worker is hanging on external HTTP requests (Tavily, Exa, OpenAI, Anthropic):
- Inspect `fi-ai` structlog output for `request_id` or `run_id` timeouts.
- Verify status pages: [status.openai.com](https://status.openai.com), [status.anthropic.com](https://status.anthropic.com).

---

## Mitigation & Recovery

### Step 1: Cancel the Stuck Run
If the run cannot recover, mark it cancelled so the user can re-trigger:
```sql
UPDATE research_runs
SET status = 'cancelled',
    error = 'Run timed out and was cancelled by operations runbook',
    updated_at = NOW()
WHERE id = '<run-id>'
  AND status NOT IN ('completed', 'failed', 'cancelled');
```

### Step 2: Clear Hanging Worker Task
Revoke the Celery task ID if known:
```bash
docker compose exec fi-worker celery -A fi_ai.worker control revoke <task-id> --terminate
```
Or restart the worker container if a hard deadlock occurred:
```bash
docker compose restart fi-worker
```

### Step 3: Verify System Health
Check that the queue begins draining and subsequent runs execute normally:
```bash
curl -f http://localhost:8000/health/ready
```
