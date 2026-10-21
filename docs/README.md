# Founder Intelligence — Documentation Portal

Welcome to the Founder Intelligence (FI) documentation repository. This portal indexes all architecture decision records, execution blueprints, operational runbooks, and squad guides.

---

## 🗺️ System Overview & Blueprints

- [Execution Blueprint](./00-execution-blueprint.md): End-to-end technical blueprint, services, database schemas, and AI pipeline lifecycle.
- [Product Roadmap](./planning/roadmap.md): Multi-sprint delivery roadmap from MVP validation to enterprise features.
- [Sprint 1 Execution Plan](./sprint-1.md): Detailed task breakdown, deliverable criteria, ownership, and ratchet policies for Sprint 1.

---

## 🏛️ Architecture & Decision Records (ADR)

- [Information Architecture](./architecture/information-architecture.md): Navigation topology, route map, and functional specifications for the 13 feature modules.
- [ADR-0001: Monorepo Architecture](./adr/0001-monorepo.md): Turborepo structure and pnpm workspace isolation.
- [ADR-0002: Async AI Research Engine](./adr/0002-async-ai-research.md): Decoupled Python Celery worker via Redis task queue.
- [ADR-0003: Relational vs Vector Storage](./adr/0003-postgres-pgvector.md): PostgreSQL 16 + pgvector unified persistence layer.
- [ADR-0004: OpenAPI-Driven Contracts](./adr/0004-openapi-contracts.md): Zod contract schemas generating types and OpenAPI 3.1 specifications.
- [ADR-0005: Workspace RBAC Enforcement](./adr/0005-rbac-and-rls.md): Role hierarchy (`owner > admin > member > viewer`) and owner promotion mechanics.
- [ADR-0006: Row-Level Security Posture](./adr/0006-rls-posture.md): Multi-tenant defense-in-depth security model and `withWorkspace` isolation.

---

## 📖 Operational Runbooks

Full index located in [Runbooks Hub](./runbooks/README.md):
- [Database Indexes](./runbooks/db-indexes.md): Migration 006 index catalog, explain queries, and verification.
- [Security Scan Gates](./runbooks/security-scan.md): CI security gates (Gitleaks, pnpm audit, Trivy).
- [Stuck Research Run](./runbooks/research-run-stuck.md): Diagnostics, queue inspection, and mitigation for halted runs.
- [LLM Provider Outage](./runbooks/llm-provider-outage.md): Handling upstream outages, model router failover, and rate limits.
- [Database Backup & Restore](./runbooks/db-restore.md): Routine snapshot procedures and disaster recovery restore steps.
- [Cost & Token Spikes](./runbooks/cost-spike.md): Investigating runaway token usage, enforcing tier ceilings, and autoscaling.
- [Rate Limiting](./runbooks/rate-limiting.md): Redis rate limiter store, tiers, fail-open behavior, and tuning.

---

## 🎨 Product Design & UX

- [UX State Patterns](./design/ux-states.md): Design tokens, loading skeletons, empty state CTAs, and actionable error banners.
- [Design Tokens (packages/ui)](../packages/ui/src/tokens.css): Shared CSS variables for color, surface, typography, and elevation.

---

## 👥 Team & Squad Organization

- [Squad Ownership](./team/squads.md): Squad rosters, workstream leads, and CODEOWNERS mapping.
- [Definition of Ready & Done](./team/dor-dod.md): Sprint engineering standards, PR checklists, and acceptance criteria.
