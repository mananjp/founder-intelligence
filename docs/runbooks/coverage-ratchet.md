# Coverage Ratchet & Non-Drop Guard

**Owner:** Platform / DevOps (Sprint 2 Task #9)
**Policy:** Upward-only. Coverage thresholds may be raised, never lowered.

## What it does

Every PR runs two gates:

1. **Per-package threshold gate** — each workspace enforces its own coverage
   floor through its test runner (`vitest ... --coverage` for Node packages,
   `pytest --cov-fail-under` for the Python AI service). A PR whose coverage
   falls below the floor fails `pnpm test`.
2. **Ratchet / non-drop guard** — [`scripts/check-coverage-ratchet.mjs`](../../scripts/check-coverage-ratchet.mjs)
   runs in CI after the test step (`if: always()`) and:
   - **Upward-only audit:** reads the threshold declared in each config file and
     fails if any has been lowered below the Sprint 2 floor. This prevents a PR
     from "fixing" red CI by dropping the bar.
   - **Non-drop check:** reads each package's `coverage-summary.json` and fails
     if measured coverage is below the floor.

## Floors — current (Wk1) and the Wk3 target

The **Wk1** deliverable (this PR) installs the guard and locks the floors at the
**current Sprint 1 baseline** — it does not raise any bar, so CI behaviour is
unchanged. The **Wk3** "raise" PR bumps the starred values to the DoD targets.

| Package            | statements | branches | functions | lines | Wk3 target (DoD)      |
| ------------------ | ---------- | -------- | --------- | ----- | --------------------- |
| `apps/api`         | 70         | 70       | 60        | 70    | **80 / 80 / 80 / 80** |
| `apps/web`         | 10         | 40       | 25        | 10    | **20 / 50 / 35 / 20** (+10 pts) |
| `packages/scoring` | 85         | 85       | 85        | 85    | 85 (already met)      |
| `apps/ai`          | 85 (`--cov-fail-under`) | — | — | — | 85 (already met)   |

> DoD target per Sprint 2 plan: **API ≥ 80%, Web +10 pts, AI/Scoring ≥ 85%.**

## Current state (Sprint 2, Wk1)

`scoring` (100%) and `ai` (85%) already clear their floors. `api` is at
~83% statements/lines and ~72% branches — comfortably above the Wk1 baseline,
and already close to the Wk3 target except on branches. `web` is at ~12% and
will need the WS5 frontend tests before the Wk3 +10-pt raise can land green.
The Wk3 raise is deliberately deferred until those feature-pod tests exist so
the raised bars go green rather than red.

> Note: `web`'s `functions` threshold (25) already exceeds its measured ~21%, a
> pre-existing condition on `main` unrelated to this guard. The Wk3 raise (or a
> separate frontend-test PR) closes it.

## How to run locally

```bash
pnpm test                       # generates coverage-summary.json per package
node scripts/check-coverage-ratchet.mjs   # or: pnpm check:coverage
```

## Raising a floor

1. Confirm the new measured coverage is at or above the proposed floor.
2. Raise the number in the package's config **and** in the matching entry of
   `scripts/check-coverage-ratchet.mjs`.
3. Never lower a floor — the upward-only audit will fail the PR.
