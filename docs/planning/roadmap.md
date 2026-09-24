# Roadmap — Founder Intelligence: Production-Grade by Sprint 3

Sequencing: each sprint ends deployable and green (CI gate). S1 is the hardening foundation; S2 ships the actual product surface; S3 goes to launch.

## Sprint 1 — Release-Readiness Foundations (current)
Hardening + plumbing so features can ship safely.
- CI = lint → typecheck → tests (coverage gate) → build → security scan (gitleaks/audit/Trivy) → GHCR push on `main`
- API: OpenAPI docs, Redis rate limit, RBAC enforcement, unified error envelope, graceful shutdown
- Data: index migration, seed script, RLS/roles ADR
- Tests: real integration suite + coverage ratchet (scoring/ai ≥85%, api/web ratchet)
- Obs/ops: `/metrics`, `/health/ready` probe, mailpit healthcheck, `LOG_LEVEL` in `.env.example`
- Frontend: typed ApiError, error boundary, loading/not-found
- Docs: `docs/README.md`, runbooks v1, 2 ADRs, CODEOWNERS → real teams
- Release: GHCR push; Render deploy deferred to S2 (needs `.env`)

Details: `docs/sprint-1.md`

## Sprint 2 — Feature Build-Out + Staging Deploy
Build the real product surface on the hardened base.
- Feature pods register & implement: Decision layer (Pod A), Reports/Workspace/Billing (Pod B), Radar/Intelligence (Pod C)
- Remaining registered modules: evidence, competitors, customers, experiments, notifications, copilot
- CI: elevate api/web coverage +10 (ratchet), enforce ≥80% global
- Deploy: Render staging auto-deploy on `main` (once `.env`/secrets provided), GHCR images consumed by deploy
- Evals suite expansion (research + prompts iteration loops)
- Load/soak smoke on staging (basic)

## Sprint 3 — Launch Readiness
- Full test coverage ≥80% enforced; edge/error paths; a11y pass on frontend
- Production secrets + Secret Manager (no placeholders), key rotation
- Alerting + dashboards (Prometheus/Grafana or PostHog), cost guards on LLM budget
- Rate-limit + abuse/DoS review, pen-test-lite (authz/RBAC/RLS deep check)
- Cutover runbook, feature flags, release automation (conventional commits + changelog + tag)
- Go/no-go review with PMO

## Backlog groom (post S3, not scheduled)
Multi-region, dedicated metrics infra, SSO/RBAC admin UI, billing integration, mobile, offline-first research client.