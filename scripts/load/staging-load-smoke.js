/**
 * Founder Intelligence — Staging Load / Soak Smoke
 * Sprint 2 Platform / DevOps (Task #10: Rahil Barchha)
 *
 * Exercises the three paths that back the staging demo:
 *   1. health      — GET /health and /health/ready (no auth)
 *   2. auth_crud    — authenticated create/read on workspaces + ideas
 *   3. sse_soak     — 50 concurrent SSE run-event streams held for 10 minutes
 *
 * Requires k6 >= 0.52 (uses the k6/experimental/sse module).
 *
 * Run (see docs/runbooks/staging-load-smoke.md for full instructions):
 *   k6 run \
 *     -e BASE_URL=https://fi-api-staging.onrender.com \
 *     -e AUTH_TOKEN=<supabase access token> \
 *     -e WORKSPACE_ID=<seeded workspace uuid> \
 *     -e IDEA_ID=<seeded idea uuid> \
 *     -e RUN_ID=<seeded run uuid> \
 *     scripts/load/staging-load-smoke.js
 *
 * Tuning env vars (all optional, defaults match the acceptance criteria):
 *   SSE_STREAMS      concurrent SSE streams              (default 50)
 *   SSE_DURATION     soak duration for SSE scenario      (default 10m)
 *   HEALTH_VUS       health-check virtual users          (default 5)
 *   HEALTH_DURATION  health scenario duration            (default 1m)
 *   CRUD_VUS         auth CRUD virtual users             (default 5)
 *   CRUD_DURATION    auth CRUD scenario duration         (default 2m)
 *   CRUD_WRITES      "1" to exercise POST (create) paths (default "1")
 */
import http from "k6/http";
import sse from "k6/experimental/sse";
import { check, fail, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const BASE_URL = (__ENV.BASE_URL || "http://localhost:4000").replace(/\/+$/, "");
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";
const WORKSPACE_ID = __ENV.WORKSPACE_ID || "";
const IDEA_ID = __ENV.IDEA_ID || "";
const RUN_ID = __ENV.RUN_ID || "";

const SSE_STREAMS = Number(__ENV.SSE_STREAMS || 50);
const SSE_DURATION = __ENV.SSE_DURATION || "10m";
const HEALTH_VUS = Number(__ENV.HEALTH_VUS || 5);
const HEALTH_DURATION = __ENV.HEALTH_DURATION || "1m";
const CRUD_VUS = Number(__ENV.CRUD_VUS || 5);
const CRUD_DURATION = __ENV.CRUD_DURATION || "2m";
const CRUD_WRITES = (__ENV.CRUD_WRITES || "1") === "1";

const authHeaders = AUTH_TOKEN
  ? { Authorization: `Bearer ${AUTH_TOKEN}`, "Content-Type": "application/json" }
  : { "Content-Type": "application/json" };

// Custom metrics -------------------------------------------------------------
const sseConnected = new Counter("sse_streams_connected");
const sseConnectErrors = new Counter("sse_connect_errors");
const sseEvents = new Counter("sse_events_received");
const sseTimeToFirstByte = new Trend("sse_time_to_first_event_ms", true);

// ---------------------------------------------------------------------------
// Scenarios + thresholds
// ---------------------------------------------------------------------------
export const options = {
  scenarios: {
    health_smoke: {
      executor: "constant-vus",
      vus: HEALTH_VUS,
      duration: HEALTH_DURATION,
      exec: "healthScenario",
      tags: { scenario: "health" },
    },
    auth_crud: {
      executor: "constant-vus",
      vus: CRUD_VUS,
      duration: CRUD_DURATION,
      exec: "crudScenario",
      tags: { scenario: "auth_crud" },
    },
    sse_soak: {
      executor: "constant-vus",
      vus: SSE_STREAMS,
      duration: SSE_DURATION,
      exec: "sseScenario",
      tags: { scenario: "sse_soak" },
      gracefulStop: "30s",
    },
  },
  thresholds: {
    // Overall request health
    http_req_failed: ["rate<0.01"],
    "http_req_duration{scenario:health}": ["p(95)<500"],
    "http_req_duration{scenario:auth_crud}": ["p(95)<1500"],
    checks: ["rate>0.99"],
    // SSE soak: every stream must connect, and we expect near-zero connect errors
    sse_connect_errors: ["count<2"],
    "checks{scenario:sse_soak}": ["rate>0.98"],
  },
};

// ---------------------------------------------------------------------------
// Setup: validate environment before generating load
// ---------------------------------------------------------------------------
export function setup() {
  const res = http.get(`${BASE_URL}/health`);
  check(res, { "health reachable at startup": (r) => r.status === 200 });
  if (res.status !== 200) {
    fail(`Target ${BASE_URL}/health returned ${res.status}; aborting load run.`);
  }

  const authReady = Boolean(AUTH_TOKEN && WORKSPACE_ID && IDEA_ID);
  const sseReady = Boolean(AUTH_TOKEN && WORKSPACE_ID && IDEA_ID && RUN_ID);
  if (!authReady) {
    console.warn(
      "[setup] AUTH_TOKEN / WORKSPACE_ID / IDEA_ID not all set — auth_crud will only probe 401 behaviour.",
    );
  }
  if (!sseReady) {
    console.warn(
      "[setup] RUN_ID not set — sse_soak will not open authenticated streams. " +
        "Provide a seeded RUN_ID to run the full 50-stream soak.",
    );
  }
  return { authReady, sseReady };
}

// ---------------------------------------------------------------------------
// Scenario 1 — health
// ---------------------------------------------------------------------------
export function healthScenario() {
  const live = http.get(`${BASE_URL}/health`, { tags: { endpoint: "health" } });
  check(live, {
    "GET /health 200": (r) => r.status === 200,
    "GET /health status ok": (r) => r.json("status") === "ok",
  });

  const ready = http.get(`${BASE_URL}/health/ready`, {
    tags: { endpoint: "health_ready" },
  });
  check(ready, {
    "GET /health/ready 200": (r) => r.status === 200,
    "GET /health/ready is ready": (r) => r.json("status") === "ready",
  });

  sleep(1);
}

// ---------------------------------------------------------------------------
// Scenario 2 — authenticated CRUD (create + read)
// ---------------------------------------------------------------------------
export function crudScenario(data) {
  // Unauthenticated calls must be rejected — verifies auth is actually enforced.
  const noAuth = http.get(`${BASE_URL}/v1/workspaces`);
  check(noAuth, { "unauthenticated /v1 -> 401": (r) => r.status === 401 });

  if (!data.authReady) {
    sleep(1);
    return;
  }

  // READ: list workspaces
  const workspaces = http.get(`${BASE_URL}/v1/workspaces`, {
    headers: authHeaders,
    tags: { op: "list_workspaces" },
  });
  check(workspaces, {
    "list workspaces 200": (r) => r.status === 200,
    "list workspaces has data[]": (r) => Array.isArray(r.json("data")),
  });

  // READ: list ideas in the seeded workspace
  const ideas = http.get(
    `${BASE_URL}/v1/workspaces/${WORKSPACE_ID}/ideas`,
    { headers: authHeaders, tags: { op: "list_ideas" } },
  );
  check(ideas, { "list ideas 200": (r) => r.status === 200 });

  // READ: single seeded idea
  const idea = http.get(
    `${BASE_URL}/v1/workspaces/${WORKSPACE_ID}/ideas/${IDEA_ID}`,
    { headers: authHeaders, tags: { op: "get_idea" } },
  );
  check(idea, { "get idea 200 or 404": (r) => r.status === 200 || r.status === 404 });

  if (CRUD_WRITES) {
    // CREATE: a throwaway idea in the seeded workspace (write path under load)
    const created = http.post(
      `${BASE_URL}/v1/workspaces/${WORKSPACE_ID}/ideas`,
      JSON.stringify({
        title: `load-smoke ${Date.now()}-${__VU}-${__ITER}`.slice(0, 160),
        rawDescription:
          "Synthetic idea created by the staging load/soak smoke test to exercise the authenticated write path.",
        geography: ["AE"],
      }),
      { headers: authHeaders, tags: { op: "create_idea" } },
    );
    check(created, {
      "create idea 201/400/422": (r) =>
        r.status === 201 || r.status === 400 || r.status === 422,
    });
  }

  sleep(1);
}

// ---------------------------------------------------------------------------
// Scenario 3 — SSE soak (50 concurrent streams for 10 minutes)
// ---------------------------------------------------------------------------
export function sseScenario(data) {
  if (!data.sseReady) {
    // Without a seeded run we can still assert the endpoint rejects anonymous
    // access, then idle so the scenario still holds the configured VUs.
    const anon = http.get(
      `${BASE_URL}/v1/workspaces/${WORKSPACE_ID || "00000000-0000-0000-0000-000000000000"}/ideas/${IDEA_ID || "00000000-0000-0000-0000-000000000000"}/research/runs/${RUN_ID || "00000000-0000-0000-0000-000000000000"}/events`,
    );
    check(anon, { "anonymous SSE rejected": (r) => r.status === 401 || r.status === 403 });
    sleep(5);
    return;
  }

  const url = `${BASE_URL}/v1/workspaces/${WORKSPACE_ID}/ideas/${IDEA_ID}/research/runs/${RUN_ID}/events`;
  const params = { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } };
  const openedAt = Date.now();
  let firstEventSeen = false;
  let opened = false;

  const response = sse.open(url, params, function (client) {
    client.on("open", () => {
      opened = true;
      sseConnected.add(1);
    });

    client.on("event", (event) => {
      if (!firstEventSeen) {
        firstEventSeen = true;
        sseTimeToFirstByte.add(Date.now() - openedAt);
      }
      sseEvents.add(1);
    });

    client.on("error", (e) => {
      sseConnectErrors.add(1);
      console.error(`[sse] stream error (VU ${__VU}): ${e && e.error ? e.error() : e}`);
    });
  });

  check(response, {
    "SSE stream opened (HTTP 200)": (r) => r && r.status === 200,
  });
  check(null, { "SSE client connected": () => opened }, { scenario: "sse_soak" });
}

// ---------------------------------------------------------------------------
// Summary: write a machine-readable result next to the run for the runbook
// ---------------------------------------------------------------------------
export function handleSummary(data) {
  return {
    stdout: textSummary(data),
    "staging-load-smoke-summary.json": JSON.stringify(data, null, 2),
  };
}

// Minimal text summary (avoids pulling the k6-summary remote module in CI).
function textSummary(data) {
  const m = data.metrics || {};
  const line = (label, metric, field) => {
    const v = metric && metric.values ? metric.values[field] : undefined;
    return `  ${label.padEnd(32)} ${v === undefined ? "n/a" : Number(v).toFixed(2)}`;
  };
  return [
    "",
    "=== Staging Load / Soak Smoke — summary ===",
    line("http_req_failed (rate)", m.http_req_failed, "rate"),
    line("http_req_duration p95 (ms)", m.http_req_duration, "p(95)"),
    line("checks (rate)", m.checks, "rate"),
    line("sse_streams_connected", m.sse_streams_connected, "count"),
    line("sse_events_received", m.sse_events_received, "count"),
    line("sse_connect_errors", m.sse_connect_errors, "count"),
    line("sse_time_to_first_event p95 (ms)", m.sse_time_to_first_event_ms, "p(95)"),
    "",
  ].join("\n");
}
