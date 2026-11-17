# Staging Load / Soak Smoke

**Owner:** Platform / DevOps (Sprint 2 Task #10)
**Script:** [`scripts/load/staging-load-smoke.js`](../../scripts/load/staging-load-smoke.js)
**Tool:** [k6](https://k6.io) `>= 0.52` (uses the `k6/experimental/sse` module)

## Purpose

Verify that the staging deployment survives the traffic shape the demo needs:

1. **health** — `GET /health` and `/health/ready` stay fast and green.
2. **auth CRUD** — authenticated reads/writes on workspaces + ideas hold up
   under concurrent virtual users, and unauthenticated calls are rejected.
3. **SSE soak** — **50 concurrent research-event streams held for 10 minutes**,
   confirming the Redis-backed SSE fan-out (`run:{id}:events`) and the API's
   keep-alive heartbeat do not leak connections or fall over.

This is a smoke + soak gate, not a capacity benchmark. It answers "is staging
healthy enough to demo?", run after each significant staging deploy and before
the G3 rehearsal.

## Prerequisites

- k6 installed locally or on the runner (`brew install k6`,
  `choco install k6`, or the Docker image `grafana/k6`).
- Staging API reachable (default `https://fi-api-staging.onrender.com`).
- **Seed v2** applied on staging (Task #2) so a golden workspace, idea and a
  completed/active run exist. Grab their UUIDs from the seed output or:
  ```sql
  SELECT id FROM workspaces ORDER BY created_at LIMIT 1;           -- WORKSPACE_ID
  SELECT id FROM ideas WHERE workspace_id = '<WORKSPACE_ID>' LIMIT 1; -- IDEA_ID
  SELECT id FROM research_runs WHERE idea_id = '<IDEA_ID>' LIMIT 1;   -- RUN_ID
  ```
- A **Supabase access token** for a member of that workspace (`AUTH_TOKEN`).
  From the web app: sign in, then copy the `access_token` from the Supabase
  session (DevTools → Application → Local Storage), or mint one with the
  Supabase CLI / admin API.

## Environment variables

| Var               | Required | Default                              | Meaning                                |
| ----------------- | -------- | ------------------------------------ | -------------------------------------- |
| `BASE_URL`        | yes      | `http://localhost:4000`              | Staging API base URL (no trailing `/`) |
| `AUTH_TOKEN`      | for 2+3  | —                                    | Supabase bearer token                  |
| `WORKSPACE_ID`    | for 2+3  | —                                    | Seeded workspace UUID                  |
| `IDEA_ID`         | for 2+3  | —                                    | Seeded idea UUID                       |
| `RUN_ID`          | for SSE  | —                                    | Seeded research run UUID               |
| `SSE_STREAMS`     | no       | `50`                                 | Concurrent SSE streams                 |
| `SSE_DURATION`    | no       | `10m`                                | SSE soak duration                      |
| `HEALTH_VUS`      | no       | `5`                                  | Health-check VUs                       |
| `HEALTH_DURATION` | no       | `1m`                                 | Health scenario duration               |
| `CRUD_VUS`        | no       | `5`                                  | Auth CRUD VUs                          |
| `CRUD_DURATION`   | no       | `2m`                                 | Auth CRUD scenario duration            |
| `CRUD_WRITES`     | no       | `1`                                  | `1` = also exercise POST (create idea) |

> If `AUTH_TOKEN` / IDs are omitted the run still executes: health runs fully,
> and the auth/SSE scenarios degrade to asserting that protected endpoints
> reject anonymous access (401/403). Provide all five to run the real soak.

## How to run

```bash
k6 run \
  -e BASE_URL=https://fi-api-staging.onrender.com \
  -e AUTH_TOKEN="$SUPABASE_ACCESS_TOKEN" \
  -e WORKSPACE_ID=<workspace uuid> \
  -e IDEA_ID=<idea uuid> \
  -e RUN_ID=<run uuid> \
  scripts/load/staging-load-smoke.js
```

Or via the Makefile helper (passes through the `-e` vars from your env):

```bash
make load-smoke BASE_URL=https://fi-api-staging.onrender.com \
  AUTH_TOKEN=$SUPABASE_ACCESS_TOKEN WORKSPACE_ID=... IDEA_ID=... RUN_ID=...
```

A quick local shake-out (shorter soak) before pointing at staging:

```bash
k6 run -e SSE_DURATION=1m -e SSE_STREAMS=10 scripts/load/staging-load-smoke.js
```

The run prints a summary and writes `staging-load-smoke-summary.json` to the
working directory. Paste the headline numbers into the results table below.

## Pass / fail criteria (k6 thresholds)

The run **fails** (non-zero exit) if any threshold is breached:

| Threshold                              | Gate            |
| -------------------------------------- | --------------- |
| `http_req_failed`                      | error rate < 1% |
| `http_req_duration{scenario:health}`   | p95 < 500 ms    |
| `http_req_duration{scenario:auth_crud}`| p95 < 1500 ms   |
| `checks`                               | > 99% pass      |
| `checks{scenario:sse_soak}`            | > 98% pass      |
| `sse_connect_errors`                   | count < 2       |

All 50 SSE streams are expected to connect (`sse_streams_connected == SSE_STREAMS`)
and stay open for the full duration with zero leaked connections (watch the API
pod's open-FD / connection count during the soak — it should plateau, not climb).

## Results

Record each staging run here. Replace the example row with real output; keep a
short history so regressions are visible across deploys.

| Date (UTC) | Commit  | BASE_URL | Streams × Duration | http_req_failed | health p95 | crud p95 | SSE connected | SSE connect errors | Verdict |
| ---------- | ------- | -------- | ------------------ | --------------- | ---------- | -------- | ------------- | ------------------ | ------- |
| _example_  | `abc123`| staging  | 50 × 10m           | 0.00%           | 180 ms     | 640 ms   | 50 / 50       | 0                  | ✅ PASS |
| _TBD_      |         |          |                    |                 |            |          |               |                    |         |

> The example row is illustrative scaffolding, not a recorded run. Delete it and
> fill the table the first time this is executed against staging; attach the
> `staging-load-smoke-summary.json` to the deploy/G-gate notes.

## Troubleshooting

- **Streams don't reach 50 / connect errors climb** — check the API pod isn't
  hitting the per-process file-descriptor or Redis connection ceiling (each SSE
  stream opens its own Redis subscriber in `lib/sse.ts`). Scale the Render
  instance or raise limits; see also [rate-limiting.md](./rate-limiting.md).
- **`health/ready` returns 503** — DB or Redis dependency is down; the body's
  `checks` map shows which. See [db-restore.md](./db-restore.md) /
  [research-run-stuck.md](./research-run-stuck.md).
- **401 on authenticated scenarios** — the Supabase token expired; mint a fresh
  one. Tokens are short-lived.
- **`http_req_duration` p95 breaches on first run after deploy** — Render free/
  starter instances cold-start; warm with a health run before the soak.
- **k6 can't find `k6/experimental/sse`** — upgrade k6 to `>= 0.52`.

## Related

- [Render staging deploy](../../infra/render.yaml) and Task #7 deploy runbook.
- [AI service Prometheus metrics](./ai-metrics.md) — watch stage/stream metrics
  during the soak.
