# ADR-0001: Monorepo with pnpm + Turborepo (TS) and uv (Python)
- Status: proposed
## Decision
One repo, three deployables (web, api, ai), shared `packages/contracts`. Python managed by uv inside `apps/ai`.
## Consequences
Atomic cross-stack PRs; contract drift caught in CI; slightly heavier CI (use path filters).
