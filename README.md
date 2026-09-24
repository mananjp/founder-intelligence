# Founder Intelligence (FI)

AI-native market intelligence and founder decision platform.
Built by DEZAI Technologies × The First Brick Community. Launch markets: Dubai/UAE + India.

> Evidence before confidence. Every recommendation must trace to evidence, assumptions and reasoning.

## Monorepo layout

| Path                 | What                                                                            | Primary owner squad  |
| -------------------- | ------------------------------------------------------------------------------- | -------------------- |
| `apps/web`           | Next.js frontend (all Bible screens)                                            | Frontend             |
| `apps/api`           | Express + TypeScript control plane, system of record                            | Core Backend         |
| `apps/ai`            | Python FastAPI + Celery: interview, research pipeline, evidence, copilot, radar | AI / Research Engine |
| `packages/contracts` | Zod schemas = the API/event contract (source of truth)                          | Backend + AI (joint) |
| `packages/scoring`   | Deterministic opportunity score + experiment ranking                            | AI (Reasoning)       |
| `packages/ui`        | Design system components + tokens                                               | Frontend + Design    |
| `db/migrations`      | SQL migrations (language-neutral source of truth for the schema)                | Core Backend         |
| `evals`              | Golden sets + eval runners for AI quality gates                                 | AI                   |
| `infra`              | Dockerfiles, Terraform, deploy config                                           | Platform / DevOps    |
| `docs`               | Blueprint, ADRs, runbooks, squad charters                                       | PMO                  |

## Quickstart (local)

```bash
cp .env.example .env            # fill in keys
make bootstrap                  # pnpm install + uv sync
make up                         # postgres(pgvector) + redis
make migrate                    # apply db/migrations
make dev                        # web :3000, api :4000, ai :8000, worker
```

Versions in `package.json` / `pyproject.toml` are starting points; commit the lockfiles after the first install.

## Working agreements (short)

- Trunk-based: short-lived branches -> PR into `main`. PR <= ~400 lines. 1 review (2 for `contracts`, `db/migrations`, `prompts`).
- Contract-first: change `packages/contracts` before changing an endpoint or event.
- Every prompt change must pass `make eval` in CI.
- Never merge a schema change without a migration in `db/migrations`.
- Decisions of consequence get an ADR in `docs/adr`.

See `docs/00-execution-blueprint.md` for the full plan.
