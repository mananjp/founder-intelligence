# Sprint 1 — Release-Readiness Foundations

- **Window:** 3 weeks from Sprint start
- **Theme:** Make the monorepo production-grade at the foundation level: contracts, tests, security, observability, and release plumbing — so Sprint 2+ can ship features fast and safely.
- **Owner:** Manan Panchal (PM) · Pace setter: Harshil Thakkar
- **Repo:** `mananjp/founder-intelligence` (public) · Branch: `main`
- **GitHub:** Milestone `Sprint 1` · one issue per task below (labels: `sprint-1`, `area:*`, `S/M/L`)

## Definition of Done (all boxes must be checked)

- [ ] CI pipeline = lint → typecheck → tests (with coverage gate) → Docker build → **security scan** (gitleaks + `pnpm audit` + Trivy, fail on high) → GHCR push on `main`
- [ ] OpenAPI v3.1 spec served at `/v1/docs`; single consistent error envelope incl. malformed JSON returns 400; Redis-backed rate limiting; **RBAC enforced**
- [ ] Migration `006` adds missing indexes; `db/seed` script; RLS enforcement model documented in ADR-0005/0006
- [ ] Real API integration suite (supertest + Postgres in CI) replaces placeholder tests; coverage thresholds configured with ratchet policy
- [ ] `/metrics` (Prometheus) exposed; `/health/ready` wired as the deploy probe; mailpit healthcheck; `LOG_LEVEL` documented in `.env.example`
- [ ] Frontend: typed `ApiError` (code/status/requestId + timeout + 401 redirect), app error boundary, `not-found.tsx`, route `loading.tsx`
- [ ] `docs/README.md` portal, 3 runbooks v1, 2 new ADRs, CODEOWNERS mapped to real team handles
- [ ] Branch protection on `main` (required status: CI) — free on public repos
- [ ] **Deploy scope:** containers pushed to GHCR on `main` merge (token-based, no secrets needed). **Render deployment is deliberately staged to Sprint 2** and runs once the team provides `.env`/prod secrets.

## Current baseline (verified — already green)

Lint ✓ (5/5) · Typecheck ✓ (8/8) · Unit tests ✓ (turbo 8/8 + pytest 8/8) · Migrations 001–005 applied ✓ · `pnpm build` ✓ · Docker images health-checked ✓ (api 359MB / web 437MB / ai 1.61GB, non-root) · Security audit clean (npm 0 + Py 0) · Request-ID tracing ✓ · Error envelope ✓ · helmet/cors ✓ · Redis/Postgres available ✓.

## Known gaps Sprint 1 closes

API: malformed JSON → 500 not 400; in-memory rate limit (breaks multi-instance); RBAC role selected but never enforced; no OpenAPI docs; shutdown doesn't drain pg/redis.
Security: RLS enabled on `workspaces` with no policy; only `ideas` protected of ~20 tables; API connects as table owner (RLS bypassed); CI has no security scan.
Data: `003`/`004` indexes missing; no seed data.
Tests: `apps/api/test/health.test.ts` is `1+1===2`; no coverage config; no integration tests against a real DB.
CI/CD: only `ci.yml`; the `evals` job points at a nonexistent `evals/` dir; no GHCR/deploy workflow.
Observability: no metrics; readiness not used as probe; mailpit has no healthcheck; `LOG_LEVEL` missing from `.env.example`.
Frontend: `apiClient` discards status/code/requestId/details; no error boundary / loading / not-found.
Docs: `docs/README.md` missing, runbooks TODO, architecture README stub, CODEOWNERS placeholder org teams.

---

## Workstream 1 — Core Backend (lead: Mann Shah `mann1325`)

| # | Task | Owner | Est | Deliverable / Acceptance criteria |
|---|------|-------|-----|----------------------------------|
| 1 | Malformed JSON → 400 | Nil `Ladnil03` | S | `errorHandler` maps body-parser `SyntaxError` → `{code:"INVALID_JSON", status 400}` incl. requestId. Existing envelope unchanged. |
| 2 | Graceful shutdown | Deep `Deep6890` | S | SIGTERM/SIGINT → stop accepting → `server.close` with 5s force-exit timer → `pool.end()` + `redis.quit()` → exit 0. Tested by SIGTERM-kill against running container. |
| 3 | Redis-backed rate limiting | Krish Parmar `KRISH-0201` | M | `rate-limit-redis` store; `/health*` skipped; distinct tier for `/internal` (higher limit); window+limit documented in runbook. Redis-down ⇒ fail-open (logged). |
| 4 | RBAC enforcement | Mann Shah (lead) | M | `requireRole('owner'|'admin'|'member'|'viewer')` middleware; role read from `workspace_members`; owner promotion via `PATCH /workspaces/:id/members/:userId`; ADR-0005 documents role model + RLS posture. |
| 5 | Migration `006_indexes` | Tirth `tirthbhanderi2006` | S | Indexes for FK/query cols in `003`/`004` tables (opportunity_scores, assumptions, experiments, recommendations, decisions, watch_items, alerts, reports, activity_log). Migration idempotent + reviewed in runbook. |
| 6 | OpenAPI v3.1 at `/v1/docs` | Mann Shah | M | OpenAPI spec generated from `@fi/contracts` Zod schemas; UI served at `/v1/docs` (swagger-ui); every registered route documented; spec validated against `openapi-schema-validator` in CI. |

## Workstream 2 — Platform / DevOps / QA (leads: Rishi Sanja `Rishisanja-3011` + Ansh Dhanani `Ansh-dhanani`)

| # | Task | Owner | Est | Deliverable / Acceptance criteria |
|---|------|-------|-----|----------------------------------|
| 7 | CI security scan job | Rishi (lead) | M | Job runs gitleaks + `pnpm audit` (0 known) + Trivy `fs` scan on repo + Trivy on built images; fails PR on high/critical findings; thresholds documented in `docs/runbooks`. |
| 8 | Coverage gate + ratchet | Rahil `RahilBarchha` | M | vitest + coverageThresholds per package (ratchet: `scoring`/`ai` ≥85% now; `api`/`web` from baseline, upward-only, +10% next sprint); CI uploads report artifact; violations fail. |
| 9 | GHCR build/push workflow | Hitarth `hitarth1812` | M | `deploy.yml`: on `main` merge → build ×3 images → push `ghcr.io/mananjp/founder-intelligence/{api,web,ai}:sha-<short>`; uses `GITHUB_TOKEN` only. Render deploy step present but disabled, enabled in Sprint 2 with `.env`. |
| 10 | Compose/health readiness | Hitarth | S | mailpit healthcheck (`wget` to API?): `mailpit` healthcheck via `/api/v1/info` curl; `render.yaml` probe → `/health/ready`; AI build+healthcheck gate job in CI. |
| 11 | Branch protection on `main` | Rishi + PM | S | `gh api` rules via GitHub App/rest API: require CI status (ci), PR required before merge, linear history. Verified by pushing a test PR. |

## Workstream 3 — AI · Reasoning, Scoring & Evals (lead: Shreeji Sojitra `shreejisojitra`)

| # | Task | Owner | Est | Deliverable / Acceptance criteria |
|---|------|-------|-----|----------------------------------|
| 12 | Evals harness v1 | Shreeji + Preet `Preetsavaliya111` | L | Create `evals/` suite (golden cases for research+prompts); replace the "harness not implemented" runner in `apps/ai/src/fi_ai/evals/run.py`; wire CI path-filtered job so it runs on prompt/research diffs instead of skipping; output structured pass/fail report artifact. |

## Workstream 4 — AI · Research Engine (lead: Sharanam Katwala `Sharanam24`)

| # | Task | Owner | Est | Deliverable / Acceptance criteria |
|---|------|-------|-----|----------------------------------|
| 13 | AI config/security parity | Sharanam | M | Provider keys (OPENAI/ANTHROPIC/TAVILY/EXA) read from env in `config.py`; fail-fast when `INTERNAL_SERVICE_TOKEN == "change-me"` in non-dev; `requestId` threaded into structlog; `/health/ready` with component checks (redis/db as configured). |
| 14 | Pipeline module unit coverage | Jiya `Jiyabhaviksadaria` | M | pytest+coverage for `research/pipeline/*` reaching the ratchet target; cases for scope/plan/discover/extract/synthesize state handling. |
| 15 | AI container build + healthcheck gate | Vraj `VRAJ-710` | S | CI job builds `fi-ai` image and asserts `{{State.Health.Status}} == healthy` (mirrors local smoke test); gitignores caches in image (UV cache already routed to `/tmp/uv-cache`). |

## Workstream 5 — Frontend (lead: Aanshi Bhut `AANSHIBHUT-25`)

| # | Task | Owner | Est | Deliverable / Acceptance criteria |
|---|------|-------|-----|----------------------------------|
| 16 | Typed `ApiError` + timeout + 401 | Prashant `PrashantCodes150` | M | `apiClient` returns `ApiError {status, code, message, requestId, details}`; `AbortController` timeout; 401 → redirect to sign-in; no `error.message` fallbacks lost. |
| 17 | App error boundary + not-found + loading | Varun `VARUN4122006` | M | Top-level `ErrorBoundary` in `layout.tsx`; `not-found.tsx`; route `loading.tsx` with skeleton; 500 fallback page. |
| 18 | Loading/error/empty states on workspace+ideas | Aanshi (lead) | M | Toasts/banners for mutation errors; empty-state UI for ideas list; uses design tokens from `packages/ui`. |

## Workstream 6 — Product Design (lead: Akanksha `akisha-dev`)

| # | Task | Owner | Est | Deliverable / Acceptance criteria |
|---|------|-------|-----|----------------------------------|
| 19 | UX error/empty/loading guidance | Akanksha | S | Doc capturing error/empty/loading patterns + copy (feeds WS5); tokens added to `packages/ui` if needed. |
| 20 | IA for 13 stub modules | Krish Singh `Kscoder11` | M | Information-architecture doc (nav, route map, page hierarchy) for the 13 unregistered modules; unblocks Sprint 2 pods; filed under `docs/architecture/`. |

## Workstream 7 — Feature Pods (contract verification only this sprint; Pod A now led by Avi after Ansh → Platform lead)

| # | Task | Owner | Est | Deliverable / Acceptance criteria |
|---|------|-------|-----|----------------------------------|
| 21 | Pod A — Decision/Scorecard contract tests | Avi Patel `avipatel708` | M | Supertest + real-PG integration tests validating `@fi/contracts` schemas for decisions/opportunity scores; OpenAPI path stubs for their domain. |
| 22 | Pod B — Reports/Workspace/Billing contract tests | Krish Bhingradiya `krishbhingradiya` + Anmol `AnmolDholiya` | M | Same for reports/billing/workspace contracts; OpenAPI path stubs. |
| 23 | Pod C — Radar contract tests | Romit `Romit2770` | M | Same for radar/intelligence contracts; OpenAPI path stubs. |

## Workstream 8 — PMO & Delivery (Manan `mananjp`, Harshil `Harshil3431`)

| # | Task | Owner | Est | Deliverable / Acceptance criteria |
|---|------|-------|-----|----------------------------------|
| 24 | Sprint mechanics + CODEOWNERS | Manan + Harshil | S | Milestone + labeled issues created; weekly standup cadence + sprint retro set; DoR/DoD published in `docs/team/`; CODEOWNERS mapped to real squad handles; squads.md kept in sync. |

---

## Coverage ratchet policy (WS2 #8)

- `packages/scoring` and `apps/ai` (pure logic): **≥85% enforced now**.
- `apps/api` and `apps/web`: gate = **current baseline**, ratchet **+10 points next sprint**, target **≥80% global by Sprint 2**.
- Coverage measured per package; CI fails PRs below threshold; report artifact uploaded for reviewers.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Coverage gap too large to close | Ratchet policy; pure-logic pkgs enforce 85% now, app code grows via integration suite in WS7+1 |
| `evals` harness is large (WS3) | Split: harness skeleton + 1 golden suite in S1; iterative suites in S2 |
| GHCR push / branch-protection quirks on personal repo | Test GHCR push manually once, then automate; protection uses GitHub App rules (works on personal public repos) |
| Redis-down behavior on API | Rate limiter fail-open + logged (WS1 #3) |
| Render deploy needs `.env` | Staged to Sprint 2 by design; no secret environment needed this sprint |

## Out of scope → Sprint 2
Feature build-out of the 13 stub modules (decisions, reports, radar, billing, etc.), Render auto-deploy + real secrets, load testing, full product copy, real billing integration, global coverage ≥80% enforcement (target), evals suite expansion.

## Change control
Plan changes require PM sign-off; task-level detail lives in the GitHub issues (single source of truth).