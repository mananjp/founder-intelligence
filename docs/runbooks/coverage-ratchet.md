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

Wk1 (merged) installed the guard at the Sprint 1 baseline. Wk3 (this PR) raises
every floor to the DoD target below.

| Package            | statements | branches | functions | lines | Note                  |
| ------------------ | ---------- | -------- | --------- | ----- | --------------------- |
| `apps/api`         | 80         | 80       | 80        | 80    | DoD: API ≥ 80%        |
| `apps/web`         | 20         | 50       | 35        | 20    | DoD: +10 pts          |
| `packages/scoring` | 85         | 85       | 85        | 85    | already met (100%)    |
| `apps/ai`          | 85 (`--cov-fail-under`) | — | — | — | already met        |

> DoD target per Sprint 2 plan: **API ≥ 80%, Web +10 pts, AI/Scoring ≥ 85%.**

## Current state (Sprint 2, Wk3 — raise applied)

`scoring` (100%) and `ai` (85%) clear their floors. **`api` and `web` do not yet
meet the raised floors** as of this PR:

| Package | statements | branches | functions | lines | Clears raised floor? |
| ------- | ---------- | -------- | --------- | ----- | -------------------- |
| `apps/api` | 83 | **72** | 80 | 83 | ❌ branches 72 < 80 |
| `apps/web` | **12** | **41** | **21** | **12** | ❌ all four below |

The gap is owned by the feature pods whose tests feed these packages — WS5
frontend (T24–T28) for `web`, and the API modules / branch coverage (T3, T5,
T31–T40) for `api`. **Until those tests land, this raise makes `pnpm test` (and
the guard) fail.** That is the intended ratchet behaviour: the bar is set to the
DoD target and does not move back down; coverage rises to meet it. Merge timing
is a PM/Platform decision — hold this PR, or land it to make the target binding
and force the remaining coverage work, per the G3 call.

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
