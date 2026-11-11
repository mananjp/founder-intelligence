# Research Setup and Research Live: state specification

| | |
|---|---|
| **Status** | v1 draft, supersedes v0, for team review |
| **Owner** | Akanksha (Product Design), Sprint 2 task T29 / issue #68 |
| **Feeds** | T27 Research Setup + Live · T5 Run lifecycle + SSE · T16 Orchestrator · T36 Plan limits |
| **Sources** | `ux-states.md`, `packages/contracts/src/research.ts`, Sprint 2 Plan, Bible §9 |
| **Companion** | `02-research-live.html` shows every state below |

**Legend:** **[Confirmed]** in `packages/contracts` today · **[Planned]** in a Sprint 2 task, no contract yet · **[Proposed]** design recommendation.

General rules come from `ux-states.md`. **Changes from v0:** 8 stages (Synthesize was missing); `cancelled` is its own state; notification promise removed; auto-redirect on completion removed; Research Setup added; reconnecting, stopping, queued and completed states added.

---

# Part A: Research Setup

T29 lists five screens and Setup is not one of them, but T27 builds it, so it needs a spec. It is a form on `/research-setup`.

| Field | Contract | Design |
|---|---|---|
| **Depth** | `depth`: quick, standard, deep. Default `quick` **[Confirmed]** | Radio group with a one-line description each. Don't show prices: the IA doc says $1, $4, $12 but `budgetUsd` is nullable and nothing confirms those numbers. |
| **Geography** | `geography`: string array, at least one **[Confirmed]** | Multi-select tags. Geography is a first-class input (Bible §38): UAE, India, global. |
| **Goals** | `goals`: string array, optional **[Confirmed]** | Optional list, each a short free-text line. |

| Setup state | Trigger | Copy |
|---|---|---|
| **Default** | Brief confirmed | Form with `quick` preselected; primary `[Start research]` |
| **No brief yet** | Interview not finalized **[Proposed]** | **Finish the interview first** · FI needs your brief before it can plan research. `[Go to interview]` |
| **Field error** | 422 `validation_failed`, empty geography | Summary **Check the highlighted fields.** Field: **Choose at least one market.** Values preserved, focus on first invalid field |
| **Submitting** | POST in flight | Button reads **Starting research…**, disabled, form kept |
| **Depth not in plan** | Plan limit on allowed depth **[Planned]** T36 | Option disabled with reason **Not included in your plan** |
| **Run limit reached** | `PLAN_LIMIT` (string not final) **[Planned]** | Form disabled, banner **You've used this month's research runs** · Your plan includes a fixed number each month. `[See plans]` |

---

# Part B: Research Live

## 1. Purpose and layout

Shows a long-running job (SSE) so waiting feels productive and the founder knows it is safe to leave. **Layout [Proposed]:** one centred column: status header, metrics row, stage list, action area.

## 2. Contracts and behaviour

- **Stages (8):** Scope, Plan, Discover, Fetch, Extract, Crosscheck, Synthesize, Recommend. They map to `RunState` values `scoping`, `planning`, `discovering`, `fetching`, `extracting`, `crosschecking`, `synthesizing`, `recommending` **[Confirmed]**.
- **Terminal states:** `completed`, `partial`, `failed`, `cancelled` **[Confirmed]**. `created` is the queued state.
- **`RunEvent.stage` is a free string**, not an enum. Confirm the values with the T5 event-schema sync before building the stepper.
- **Durable SSE [Planned]:** auto-reconnect with `Last-Event-ID`; the stream is exempt from the request timeout.
- **API [Planned]:** list, get and cancel runs only. **There is no resume endpoint**, so "Try again" starts a new run.

## 3. Header and metrics

- **Header:** **Researching your idea** · You can leave this page. Research keeps running on our servers, so come back whenever you like.
- **Why not "we'll notify you":** notifications are T37, a week 3 task. `ux-states.md` §6 says don't promise what we can't guarantee. Revisit once T37 ships.
- **Elapsed time:** from `createdAt` **[Confirmed]**. Not announced to screen readers.
- **Spend:** `spentUsd`, with "of `budgetUsd`" only when `budgetUsd` is not null **[Confirmed]**.
- **Sources gathered:** **[Planned]**. No typed field exists (`RunEvent.data` is untyped). Show it only if the event schema defines it; otherwise omit it.

## 4. Stage list

An ordered list; each row has an icon **and** a text status: **Not started**, **In progress**, **Done**, **Couldn't finish** (`stage.failed`). Plain-language names: Scoping the question, Planning the research, Finding sources, Reading sources, Extracting claims, Cross-checking evidence, Synthesizing insights, Writing recommendations. Open question: if a stage fails but the run continues, does the row stay failed?

## 5. States

| State | Trigger | UI | Copy |
|---|---|---|---|
| **Queued** | `created` | Header, all stages Not started, Stop enabled | **Research is queued** · It will start shortly. |
| **Running** | Any active stage | Stage list, metrics, Stop | as §3 |
| **Reconnecting** | SSE dropped, auto-retrying | Persistent `role="status"` banner; stage list stays visible | **Reconnecting to the live feed** · Research is still running. This will catch up on its own. |
| **Can't reach feed** | Retries keep failing (threshold **[Proposed]**) | Warning banner | **We can't reach the live feed** · Research is still running. `[Try again]` |
| **Browser offline** | Browser offline event | Banner clears itself | **You're offline** · Live updates will resume when your connection is back. |
| **Confirming stop** | Press Stop | Dialog | **Stop this research?** · You can start a new run any time. `[Stop research]` `[Keep running]` |
| **Stopping** | `cancelRequestedAt` set, state not terminal | Button reads **Stopping…**, disabled | **Stopping research** · This can take a moment. |
| **Completed** | `completed` | Completion panel; focus moves to its heading; **no automatic redirect** | **Research complete** · Your results are ready. `[View results]` (Intelligence Home) |
| **Partial** | `partial` | Persistent warning banner | **Research stopped early** · We reached this run's budget limit, so results use the sources gathered so far. Treat gaps as unknown, not as absent. `[View what we found]` |
| **Failed** | `failed` | Persistent error banner | **Research couldn't finish** · We stopped before producing results. Your idea is unchanged. `[Try again]` + reference ID |
| **Cancelled** | `cancelled` | Neutral banner, not an error | **Research was cancelled** · `[Start again]` |

**Why no auto-redirect:** a page that navigates by itself is disorienting, worst for screen-reader users and for a partial result the founder should read first.

## 6. Accessibility

- Stage list is an `<ol>`; the active row has `aria-current="step"`; status is text, not icon alone.
- A visually hidden `role="status"` announces stage changes only ("Now: cross-checking evidence"), not every progress event.
- Failure banners use `role="alert"`; partial and cancelled persist. The pulse on the active row stops under `prefers-reduced-motion`.
- Stop dialog: focus trap, Esc closes, focus returns to the Stop button.

## 7. Handoff and open questions

**T27 (Varun).** **T5 (Krish):** stage strings and event schema. **T16 (Sharanam):** cancel behaviour.
1. What happens to evidence gathered before a cancel: kept, partial, or discarded? (The Home spec currently assumes nothing is shown. Align once answered.)
2. If a stage fails but the run continues, what does the stepper show?
3. Is a source count part of the event schema?
4. Will resume ever be exposed? Until then "Try again" means a new run.
5. Reconnect-failure threshold.
6. Exact `PLAN_LIMIT` code and payload from T36.
