# Sprint 2 — First Vertical Slice + Staging Deploy

- **Window:** 3 weeks — proposed **Mon 2 Nov → Fri 20 Nov 2026** (confirm dates; see Assumptions)
- **Theme:** Turn the hardened foundation into the first real product slice: a founder completes the adaptive interview, starts a quick research run, watches it progress live, and reads evidence-backed findings, a scorecard and a quick brief — running on **staging**.
- **Owner:** Manan Panchal (PM) · Pace setter: Harshil Thakkar
- **Repo:** `mananjp/founder-intelligence` · Branch: `main` · Baseline commit reviewed: `ac69a2b`
- **GitHub:** Milestone `Sprint 2` · one issue per task below (labels: `sprint-2`, `area:*`, `S/M/L`)

## Sprint goal (the demo)

> On staging, with a golden idea (one UAE, one India), a founder can: **interview → brief → start quick run → watch stages live → open Evidence Vault (claims with status badges and verbatim quotes) → see Scorecard with evidence coverage → export a Quick Brief PDF.**

Everything below either feeds that path or is marked **stretch**.

## Who is on this sprint

Assigned: Manan, Harshil, Rishi, Rahil, Mann, Krish Parmar, Sharanam, Preet, Jiya, Vraj, Shreeji, Aanshi, Varun, Prashant, Akanksha, Avi, Krish Bhingradiya, Anmol, Romit (19 people).

**Not assigned this sprint:** Tirth, Yug, Nil, Krish Singh, Hitarth, Deep, Ansh. Their Sprint 1 work is done and merged; nothing in this plan depends on them. Their absence thins five squads, and the plan compensates as follows:

| Squad | Impact | Compensation |
|---|---|---|
| Core Backend | Mann + Krish Parmar only | Feature pods (Avi, Krish Bhingradiya, Anmol, Romit) own their own modules end-to-end (API + UI); Core Backend keeps shared plumbing only |
| Platform | Hitarth out | Rishi + Rahil; Python CI services and Render deploy are sequenced first |
| AI — Reasoning | Yug out | Shreeji + Preet; evals expansion goes to Vraj |
| Product Design | Krish Singh out | Akanksha designs only the 5 screens on the demo path; other screens use IA doc + tokens |

## Definition of Done (all boxes must be checked)

- [ ] All 8 research pipeline stages implemented (no stub `run()` bodies), idempotent, persisted via the AI repository layer, resumable after failure
- [ ] LLM router live: structured output validated with retry, tier fallback, every call written to `llm_calls`, cost feeds the run budget guard
- [ ] `POST /internal/interview/turn` + `/v1/.../interview` produce a versioned `research_brief` from a real conversation
- [ ] End-to-end integration test runs all 8 stages on recorded fixtures against real Postgres in CI; asserts no uncited insight and valid claim statuses
- [ ] Migration `007` (competitors, customer_segments, signals, notifications + run-resume columns) applied in CI with RLS per ADR-0006
- [ ] API modules registered and in OpenAPI: interview, evidence, scorecard, assumptions, experiments, decisions, competitors, customers, radar, reports, billing (plan limits), notifications
- [ ] SSE research events are durable (reconnect with `Last-Event-ID` replays missed events)
- [ ] Frontend demo path works against staging: auth → interview → research setup → research live → evidence → scorecard → reports
- [ ] Render **staging** auto-deploys from `main` after CI green; `/health/ready` is the probe; post-deploy smoke passes
- [ ] Coverage ratchet raised (api ≥ 80, web +10 pts, ai/scoring ≥ 85); thresholds never lowered
- [ ] Evals: golden suites for scope, plan, extraction, crosscheck, interview; CI gate on `unsupported_claim_rate` and `quote_verbatim_rate`
- [ ] Basic load/soak smoke run against staging with results in `docs/runbooks/`
- [ ] ADR-0007 (score ownership) merged; `docs/team/squads.md` and `docs/README.md` updated

## Current baseline (verified in repo at `ac69a2b`)

Done in Sprint 1: CI (lint → typecheck → tests → security scan → GHCR push), OpenAPI at `/v1/docs`, RBAC, Redis rate limiting, graceful shutdown, migrations 001–006, typed `ApiError` + error boundary + loading/not-found, runbooks, ADR-0005/0006, contract tests for Pod A/B/C, IA doc for the 13 modules, `evals/golden/extraction` (3 cases) and an evals runner.

## Gaps Sprint 2 closes (found in the repo, not assumed)

| Area | Finding | Closed by |
|---|---|---|
| Pipeline | All 8 stages in `research/pipeline/*.py` are 11-line stubs | T13, T17–T23 |
| LLM | `llm/router.py::complete_structured` raises `NotImplementedError` | T11 |
| Orchestrator | Budget hardcoded to 1.0; `publish()` only logs; state not persisted; no resume | T16 |
| AI service | `/internal/interview/turn` not implemented | T12 |
| API | Only `ideas`, `research`, `workspaces`, `internal`, `health` are wired; `app.ts` still has the module TODO | T3, T4, T5, T31–T38, T40 |
| Schema | **No tables for Competitor, CustomerSegment, Signal, notifications** (Bible §29 entities) | T1 |
| CI | **Python job has no Postgres/Redis service**, so DB-backed AI tests cannot run | T6 |
| Deploy | `render-deploy` job is `if: false` | T7 (needs T41) |
| Realtime | SSE uses Redis pub/sub only — a reconnecting client loses events | T5, T27 |
| Design | Priority screens have no hi-fi specs | T29 |
| Decision | Unclear who computes the opportunity score (AI proposes, `@fi/scoring` is TypeScript) | T14 (ADR-0007) |

---

## Critical path and gates

Task numbers (T1–T43) are global and match the `#` column in the workstream tables.

```
T15 AI repo layer ─┐
T11 LLM router ────┼─► T19 scope·plan ─► T17 discover ─► T18 fetch ─► T20 extract ─► T21 crosscheck ─► T13 synthesize ─► T22 recommend ─► T23 E2E
T16 Orchestrator ──┘

T1 migration 007 ─► T5 run lifecycle · T15 repo layer · T37 notifications · T38 competitors/customers
T41 secrets ─► T7 Render staging ─► T10 load smoke
T29 design specs ─► T25 interview UI · T27 research live UI · T28 evidence/home UI · T31 scorecard UI
```

| Gate | When | Must be true | If missed |
|---|---|---|---|
| **G1** | End of Week 1 (Fri 6 Nov) | T1, T6, T11, T15 merged · T41 secrets delivered · T14 (ADR-0007) merged · T29 interview + live specs delivered | Manan/Harshil cut stretch items immediately; pipeline work takes priority over all pods |
| **G2** | End of Week 2 (Fri 13 Nov) | Orchestrator runs scope→extract on fixtures end-to-end · interview round-trip works API↔AI · staging deploys | Defer recommend/reports polish; protect the live-run path |
| **G3** | Thu 19 Nov | Demo rehearsed on staging with golden ideas | Fri 20 Nov = demo, retro, carry-over triage |

---

## Workstream 1 — Core Backend (lead: Mann Shah `mann1325`)

| # | Task | Owner | Est | Wk | Deliverable / Acceptance criteria |
|---|------|-------|-----|----|----------------------------------|
| 1 | Migration `007` | Mann Shah `mann1325` | M | 1 | Adds `competitors`, `customer_segments`, `signals`, `notifications`; adds `research_runs.last_completed_stage` + `cancel_requested_at`; indexes; RLS policies following ADR-0006; idempotent; passes CI migrations job; runbook note in `db-indexes.md`. **Blocks T2, T5, T15, T37, T38.** |
| 2 | Seed v2 — demo workspace | Mann Shah `mann1325` | S | 1–2 | `db/seed` adds a golden workspace + idea + brief + run + sources/evidence/claims (all 7 statuses) + insights + score + assumptions so Frontend and pods build before the pipeline lands. Re-runnable. |
| 3 | Evidence module | Mann Shah | M | 2 | `GET …/claims` (filter by module/status), `GET …/claims/:id` (evidence, sources, contradictions), `GET …/sources`. Zod from `@fi/contracts`, OpenAPI documented, RBAC (viewer can read). Integration tests on real PG. |
| 4 | Interview module (API side) | Krish Parmar `KRISH-0201` | M | 1–2 | `POST …/interview/turns` (persists `interview_turns`, proxies to AI `/internal/interview/turn`), `GET …/interview`, brief finalization writes a versioned `research_briefs` row. Contract-first in `@fi/contracts`; works against a fake AI during week 1. |
| 5 | Run lifecycle + durable SSE | Krish Parmar | M | 2 | `GET …/runs`, `GET …/runs/:runId`, `POST …/runs/:runId/cancel`; events stored in a Redis Stream (or table) so SSE honours `Last-Event-ID` and replays missed events; event schema agreed with Sharanam (T13). |

## Workstream 2 — Platform / DevOps / QA (lead: Rishi Sanja `Rishisanja-3011`)

| # | Task | Owner | Est | Wk | Deliverable / Acceptance criteria |
|---|------|-------|-----|----|----------------------------------|
| 6 | Python CI: Postgres + Redis services | Rishi Sanja `Rishisanja-3011` | S | 1 (by Wed) | `python` job gets `pgvector/pgvector:pg16` + Redis services, migrations applied, `pytest -m integration` marker, coverage still uploaded. **Unblocks Jiya (T15).** |
| 7 | Render staging deploy | Rishi Sanja | M | 1–2 | Remove `if: false`; deploy hook + secrets via GitHub Environments / Render env (never in repo); env-var matrix doc; `/health/ready` as probe; post-deploy smoke step fails the job on red. Depends on T41. |
| 8 | AI service `/metrics` | Rishi Sanja | S | 3 | Prometheus counters/histograms: stage duration, run state totals, LLM tokens + cost by task/model, budget-exceeded count; names documented in a runbook. |
| 9 | Coverage ratchet raise | Rahil `RahilBarchha` | M | 1 + 3 | Wk1: per-PR "coverage must not drop" comment. Wk3 (after features land): raise thresholds in one PR — `apps/api` ≥ 80 (currently 70/70/60/70), `apps/web` +10 pts (currently 10/40/25/10), `ai`/`scoring` stay ≥ 85. Upward only; `rate-limiting.md`-style runbook entry. |
| 10 | Staging smoke + load/soak | Rahil `RahilBarchha` | M | 3 | k6 or autocannon script: health, authenticated CRUD, SSE with 50 concurrent streams for 10 min; results + thresholds in `docs/runbooks/staging-load-smoke.md`. Depends on T7. |

## Workstream 3 — AI · Reasoning, Scoring & Evals (lead: Shreeji Sojitra `shreejisojitra`)

| # | Task | Owner | Est | Wk | Deliverable / Acceptance criteria |
|---|------|-------|-----|----|----------------------------------|
| 11 | LLM router | Shreeji Sojitra `shreejisojitra` | L | 1 | Implement `complete_structured` via LiteLLM: task→tier from `models.yaml`; Pydantic validation with one retry that appends the validation error; strong→fast fallback flagged as lower-confidence; timeouts; one `llm_calls` row per call; cost added to `RunContext.spent_usd`; `FakeLLM` for tests. Coverage ≥ 85%. **Blocks all LLM stages — merge a usable version by Wed of week 1.** |
| 12 | Adaptive interview turn | Shreeji Sojitra | M | 2 | `interview.v1.yaml` prompt + `POST /internal/interview/turn`: tracks missing variables (customer, geography, problem severity, alternatives, business model, known evidence) per Bible §8, asks one question at a time, marks unproven founder claims as assumptions, returns a complete Research Brief when done. 8+ eval cases. |
| 13 | Synthesize stage | Preet Savaliya `Preetsavaliya111` | M | 3 | Per-module insights (market, customer, competitive, demand, pricing, gtm); every insight cites existing `claim_ids`; uncited output rejected; writes `insights`. Develops against fixture claims in week 2. |
| 14 | ADR-0007: who computes the score | Shreeji Sojitra + Avi Patel `avipatel708` | S | 1 | Decide and document: AI `recommend` stage writes dimension proposals (`insights` with `module='score_proposal'`, each dimension with rating + cited claims); the Node scorecard module calls `computeOpportunityScore` and persists `opportunity_scores`. Merged by Fri wk1 or the owners escalate to Manan. |

## Workstream 4 — AI · Research Engine (lead: Sharanam Katwala `24aiml063-cell`)

| # | Task | Owner | Est | Wk | Deliverable / Acceptance criteria |
|---|------|-------|-----|----|----------------------------------|
| 15 | AI repository layer | Jiya Sadaria `Jiyabhaviksadaria` | M | 1 | SQLAlchemy Core tables in `fi_ai/db` mirroring migrations 002/003/005 (+007 once merged); repo functions with idempotent upserts (`sources` on `(url, content_hash)`, etc.); integration tests on real PG. **Blocks every stage's persistence — Protocol/interface merged by Tue so others can code against it.** |
| 16 | Orchestrator persistence | Sharanam Katwala `24aiml063-cell` | M | 1 | Load run + brief from DB; depth→budget from `RUN_BUDGET_USD_*`; persist state + `last_completed_stage` after each stage; resume at the failed stage on retry; honour `cancel_requested_at`; publish events to Redis (durable stream, agreed with T5); budget exhaustion → `partial`. Removes the 4 TODOs in `orchestrator.py`. |
| 17 | Search layer + discover stage | Sharanam Katwala | M | 1–2 | `SearchProvider` interface; Tavily + Exa adapters; URL dedupe; ranking by source-class prior; geography/language-aware query templates (UAE + India first-class); per-run query cap; recorded-response fixtures for tests. |
| 18 | Fetch stage | Vraj `VRAJ-710` | M | 1–2 | robots.txt respected; per-domain rate limit; TTL cache by URL hash; `trafilatura` readability; snapshot stored via storage adapter with `content_hash` + `accessed_at`; failures recorded per URL, not run-fatal. Playwright fallback is out of scope. Paired with Sharanam for review. |
| 19 | Prompt registry loader + scope & plan stages | Preet Savaliya `Preetsavaliya111` | M | 1–2 | YAML loader with version pinning + schema check + CI lint for `prompts/*.yaml`; `scope` turns brief → prioritized `ResearchQuestion`s with required source classes; `plan` turns questions → tasks with per-task budgets. Eval cases added. |
| 20 | Extract stage + verbatim gate | Jiya Sadaria `Jiyabhaviksadaria` | M | 2 | Structured extraction into `evidence`; **hard gate: any quote that is not a verbatim substring of the snapshot (whitespace-normalised) is discarded**; embeddings stored; `quote_verbatim_rate` emitted as a metric and eval score (target 100%). |
| 21 | Crosscheck stage | Preet Savaliya `Preetsavaliya111` | M | 2–3 | Cluster claims by embedding; stance via fast-tier NLI; syndication/independence dedupe by publisher; statuses assigned **only** through `derive_claim_status`; writes `claims`, `claim_evidence`, `claim_contradictions`. |
| 22 | Recommend stage + quality gate | Jiya Sadaria `Jiyabhaviksadaria` | M | 3 | Recommendations with cited claims, seeded assumptions, unknowns + risk register, score-dimension proposals per ADR-0007; `quality_gate.check_recommendation` enforced fail-closed before persisting. |
| 23 | End-to-end pipeline test + staging dry run | Sharanam Katwala | M | 3 | CI integration test: all 8 stages on recorded fixtures against real PG for one UAE and one India golden idea; asserts no uncited insight, valid statuses, budget respected, resume-after-failure works. Plus a script for one real-provider dry run on staging. |
| 44 | Evals expansion + CI gate | Vraj `VRAJ-710` (reviewer: Preet Savaliya `Preetsavaliya111`) | M | 2–3 | Golden suites under `evals/golden/` for scope, plan, crosscheck and interview (extraction already has 3 cases) with at least 8 cases each, including seeded contradictions and an irrelevant-document case; CI `evals` job fails when `unsupported_claim_rate` ≥ 5% or `quote_verbatim_rate` < 100%; structured report uploaded as an artifact. Reuses the existing runner in `fi_ai/evals/run.py`. |

## Workstream 5 — Frontend (lead: Aanshi Bhut `AANSHIBHUT-25`)

| # | Task | Owner | Est | Wk | Deliverable / Acceptance criteria |
|---|------|-------|-----|----|----------------------------------|
| 24 | Auth, session, workspace switcher | Aanshi Bhut `AANSHIBHUT-25` | M | 1 | Supabase sign-in/up wired; token injected into `apiClient`; route guard + existing 401 redirect; workspace list/create/switch; ideas list/create. Component + integration tests. |
| 25 | Adaptive Interview UI | Aanshi Bhut | L | 2–3 | Chat-style turn UI per Akanksha's spec; resolved-variables progress; brief preview + confirm; retry on error. Built against a fixture until T4 lands. |
| 26 | App shell + idea navigation | Varun `VARUN4122006` | M | 1 | Sidebar for the 13 modules per `architecture/information-architecture.md`, breadcrumbs, responsive; role-aware (viewer is read-only). Provides the slot for the notifications bell (T37). |
| 27 | Research Setup + Research Live | Varun `VARUN4122006` | L | 2–3 | Depth/geography/goals form; SSE client with auto-reconnect + `Last-Event-ID`; stage timeline; completed / partial / failed / cancelled states; cancel button. |
| 28 | Evidence Vault + Intelligence Home | Prashant `PrashantCodes150` | L | 2–3 | Claims table with `EvidenceBadge`, filters, source drawer showing verbatim quote + source date + access date, contradictions view; Home dashboard from the overview endpoint (latest run, score summary, top risks, counts). Develops on seed v2 until the pipeline lands. |

## Workstream 6 — Product Design (lead: Akanksha `akisha-dev`)

| # | Task | Owner | Est | Wk | Deliverable / Acceptance criteria |
|---|------|-------|-----|----|----------------------------------|
| 29 | Hi-fi specs for the 5 demo-path screens | Akanksha `akisha-dev` | L | 1–2 | Interview, Research Live, Evidence Vault, Intelligence Home, Scorecard — with states (loading/empty/error/partial), real design tokens in `packages/ui`, and handoff notes. **Order and due dates: Interview + Live by end of wk1, Evidence + Home by mid wk2, Scorecard by end wk2.** |
| 30 | Design QA + accessibility pass | Akanksha `akisha-dev` | S | 3 | Review shipped screens against specs; contrast, focus order and keyboard checks; copy for new empty/error states; issues filed as `area:design`. |

## Workstream 7 — Feature Pods (each pod owns API + UI for its modules)

### Pod A — Decision layer (lead: Avi Patel `avipatel708`)

| # | Task | Owner | Est | Wk | Deliverable / Acceptance criteria |
|---|------|-------|-----|----|----------------------------------|
| 31 | Scorecard module (API + UI) | Avi Patel `avipatel708` | L | 1–3 | `GET …/scorecard` (latest + history), `POST …/scorecard/compute` (reads `score_proposal` insights, calls `@fi/scoring`, persists `opportunity_scores` with coverage). UI shows 10 dimensions and the headline as e.g. "7.8 / 10 · 62% evidence coverage" (Bible §17); never a bare score. API wk2 on seed v2, UI wk3. |
| 32 | Overview aggregate endpoint | Avi Patel | M | 2 | `GET …/overview`: latest run state, score + coverage, top risks, claim counts by status, open assumptions. Contract agreed with Prashant (T28) by Mon wk2. |
| 33 | Assumptions + Experiments modules (API) | Avi Patel `avipatel708` | M | 1–2 | Assumptions CRUD + status transitions (`unverified → testing → supported → weakened → rejected → accepted`) + claim links; Experiments CRUD linked to assumptions, ranked with `rankExperiments`. OpenAPI + integration tests. |
| 34 | Decisions module (API) | Avi Patel `avipatel708` | M | 3 | Create a decision linked to recommendation / claims / assumptions; `GET` returns the decision-trace chain (recommendation → evidence → assumptions → risk) per Bible §20. UI for assumptions/experiments/decisions is **stretch**. |

### Pod B — Reports, Workspace, Billing (lead: Krish Bhingradiya `krishbhingradiya`)

| # | Task | Owner | Est | Wk | Deliverable / Acceptance criteria |
|---|------|-------|-----|----|----------------------------------|
| 35 | Reports module (API + UI + PDF) | Krish Bhingradiya `krishbhingradiya` | L | 2–3 | `POST …/reports` generates a `quick_brief` from the latest run (executive verdict, problem, ICP, competitors, pricing, score + coverage, assumptions, unknowns, evidence appendix with source links and status labels); `GET`; PDF export via Playwright; Reports page lists/previews/downloads. Builds on seed v2 in week 2. |
| 36 | Plan limits + usage | Anmol Dholiya `AnmolDholiya` | M | 1–2 | Plan tiers as config; middleware enforces runs/month and allowed depth on run start (clear `PLAN_LIMIT` error); `GET …/usage` from `research_runs` + `llm_calls`; pricing page reads the tier config. **Stripe stays out of scope.** |
| 37 | Notifications module + bell | Anmol Dholiya `AnmolDholiya` | S | 3 | List / mark-read from alerts + run-complete events; bell in the app shell from T26. |

### Pod C — Intelligence views & Radar (lead: Romit Kakadiya `Romit2770`)

| # | Task | Owner | Est | Wk | Deliverable / Acceptance criteria |
|---|------|-------|-----|----|----------------------------------|
| 38 | Contracts + competitors/customers APIs | Romit Kakadiya `Romit2770` | M | 1–2 | Zod contracts for `Competitor` (direct / indirect / substitute / emerging / DIY), `CustomerSegment`, `Signal` after T1 (draft contracts by Wed wk1); list/detail endpoints with linked claims + evidence; OpenAPI + integration tests. |
| 39 | Competitors Matrix UI | Romit Kakadiya | M | 3 | Matrix by competitor class with evidence-linked cells per Bible §13; empty/loading/error states from the design guide. Customers/Market UIs are **stretch**. |
| 40 | Radar API (watch items + alerts) | Romit Kakadiya | M | 2–3 | `watch_items` CRUD, `alerts` list/mark-read, default watch suggestions derived from competitors. The diff/significance engine is **out of scope** (Phase 4). |

## Workstream 8 — PMO & Delivery (Manan `mananjp`, Harshil `Harshil3431`)

| # | Task | Owner | Est | Wk | Deliverable / Acceptance criteria |
|---|------|-------|-----|----|----------------------------------|
| 41 | Secrets and keys handover | Manan `mananjp` | S | 1 (**by Wed**) | Supabase project (URL, anon key, JWT secret), LLM provider keys for fast/strong/embedding tiers, Tavily/Exa keys, Render account + deploy hook; set per-run budget ceilings. Delivered through GitHub Environments / Render env, never the repo. **Hard blocker for T7 and T23.** |
| 42 | Sprint mechanics | Manan + Harshil `Harshil3431` | S | 1 | Milestone `Sprint 2`, labeled issues with dependency links, project board, standup cadence, `squads.md` + `docs/README.md` updated, DoR/DoD reaffirmed. |
| 43 | Gate reviews, demo, retro | Harshil `Harshil3431` (+ Manan) | S | 1–3 | G1/G2/G3 reviews with explicit scope-cut decisions; demo script on staging; retro; carry-over triage into Sprint 3. |

---

## Dependency summary

| Blocker | Blocks |
|---|---|
| T1 Migration 007 (Mann) | T2 seed v2, T5 run lifecycle, T15 AI repo layer, T37 notifications, T38 competitors/customers |
| T6 Python CI services (Rishi) | T15 repo-layer integration tests (Jiya) |
| T11 LLM router (Shreeji) | T12 interview, T13 synthesize, T19 scope/plan, T20 extract, T21 crosscheck, T22 recommend |
| T15 AI repo layer (Jiya) | T16 orchestrator persistence and every stage's persistence |
| T41 Secrets (Manan) | T7 Render deploy, T23 real-provider dry run, T10 load smoke |
| T14 ADR-0007 (Shreeji + Avi) | T22 recommend output shape, T31 scorecard compute |
| T29 Design specs (Akanksha) | T25 interview UI, T27 research live UI, T28 evidence/home UI, T31 scorecard UI |

## Coverage policy for this sprint

- `packages/scoring`, `apps/ai`: **≥ 85%** (unchanged, enforced).
- `apps/api`: currently 70/70/60/70 → **≥ 80** statements/lines at sprint end.
- `apps/web`: currently 10/40/25/10 → **+10 points** each at sprint end.
- Thresholds only ever go up. Until the raise PR (week 3), no PR may lower coverage.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Pipeline is the critical path and has 5 people on it | Gates G1/G2; router and repo-layer interfaces merged early so stage work is parallel; everything else is cut before the pipeline |
| Core Backend is two people | Pods own their modules end-to-end; Core Backend keeps only migration, seed, evidence, interview, run lifecycle |
| Keys/secrets arrive late | T41 due Wed wk1; stages develop against `FakeLLM` and recorded fixtures so only the final dry run needs real keys |
| LLM/search cost overrun | Per-depth budget ceilings in env; budget guard → `partial`; `/metrics` cost counters |
| Score ownership ambiguity causes rework | ADR-0007 by end of week 1 |
| Verbatim-quote gate discards too much real evidence | Whitespace/entity normalisation; measure discard rate in evals before tuning |
| Solo designer | Only 5 screens specced; others use IA + tokens; Interview + Live specs front-loaded |
| Staging deploy slips | Rishi starts the CI/env work in week 1 independent of secrets; GHCR images already exist |
| Holiday/exam overlap in a 3-week window | Confirm availability before locking dates (see Assumptions) |

## Assumptions to confirm

1. **Dates:** 2 Nov – 20 Nov 2026 is proposed. Diwali falls in early November; if the team is off or has university exams in that window, slide the sprint or cut stretch work.
2. **Ansh Dhanani:** Excluded from Sprint 2 (Sprint 1 work complete / not assigned for Sprint 2); Pod A modules (Scorecard, Overview, Assumptions, Experiments, Decisions) owned end-to-end by Avi Patel.
3. **Copilot is deferred to Sprint 3** (the roadmap listed it under Sprint 2). It needs the evidence graph and retrieval, and the pipeline is the critical path. It becomes a stretch item for Shreeji only if router + interview land early.
4. **"≥ 80% global coverage by Sprint 2"** from the Sprint 1 plan is not realistic for `apps/web` (currently 10% statements). This plan ratchets +10 points and leaves the ≥ 80% enforcement to Sprint 3, which the roadmap already lists.

## Stretch (only if a gate is green early)

UI for Assumptions / Experiments / Decisions · Customers and Market UIs · Founder Copilot · Members management UI · Playwright fetch fallback.

## Out of scope → Sprint 3

Founder Copilot, radar diff/significance engine, Stripe billing, JWKS auth hardening, production secrets + secret manager, alerting dashboards, a11y audit across all screens, ≥ 80% global coverage enforcement, feature flags and release automation.

## Change control

Plan changes require PM sign-off; task-level detail lives in the GitHub issues (single source of truth).
