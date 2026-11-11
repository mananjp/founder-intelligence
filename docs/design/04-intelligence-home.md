# Intelligence Home: state specification

| | |
|---|---|
| **Status** | v0 draft, for team review |
| **Owner** | Akanksha (Product Design), Sprint 2 task T29 / issue #68 |
| **Feeds** | T28 Evidence Vault + Home · T32 Overview aggregate endpoint |
| **Sources** | `ux-states.md`, `packages/contracts` (`opportunity.ts`, `evidence.ts`, `research.ts`), `packages/scoring`, Bible §17, Sprint 2 Plan |
| **Companion** | `04-intelligence-home.html` shows every state below |

**Legend:** **[Confirmed]** in `packages/contracts` or `packages/scoring` today · **[Planned]** in a Sprint 2 task, no contract yet · **[Proposed]** design recommendation.

General rules come from `ux-states.md`.

---

## 1. Purpose and layout

The executive view of one idea: where research stands, what the score says and how much evidence is behind it, what could sink the idea, and what is still unproven. **Layout [Proposed]:** run-status header; score card; claims-by-status card; top risks; open assumptions. Each card loads and fails on its own (region loading, `ux-states.md` §3), so one slow or broken card never blocks the page.

## 2. Data

T32 returns: latest run state, score and coverage, top risks, claim counts by status, open assumptions.

| Card | Data | Status |
|---|---|---|
| Run header | `ResearchRun.state` (13 values), `spentUsd`, `budgetUsd`, `completedAt` | **[Confirmed]** |
| Score | `overallScore` (0 to 10, one decimal), `evidenceCoverage` (0 to 1) | **[Confirmed]** |
| Claim counts | counts per `ClaimStatus` (7 values) | **[Confirmed]** statuses, **[Planned]** counts |
| Top risks | none | **[Planned]** T22 risk register; no contract |
| Open assumptions | none | **[Planned]** T33; no contract |

There is no overview contract in `packages/contracts` yet, so field names here are provisional.

## 3. Rules that matter

1. **Score and coverage are never apart.** Always render "7.8 / 10" with "62% evidence coverage" beside it (Bible §17). Coverage is multiplied into the score in `computeOpportunityScore`, so a score without it misleads.
2. **No score is not zero.** A missing score reads "No score yet". Never `0`, never an empty ring (`ux-states.md` §4).
3. **Low coverage gets a plain sentence** under the score, e.g. "Most of this score rests on assumptions." The threshold is an open question (§7).
4. **Counts link to the Vault** filtered by that status.
5. **Colour is never the only signal.** Status chips carry glyph and text, as in the Vault.

## 4. States

| State | Trigger | UI | Copy |
|---|---|---|---|
| **Route loading** | Navigating in | Skeleton of all five cards | none |
| **No run yet** | Idea has no run | One full-width empty state, no empty cards | **Nothing researched yet** · Run research and FI will score this idea from evidence. `[Set up research]` |
| **Running** | Run in a non-terminal state | Header shows stage and elapsed time with a link to Live; score card shows "No score yet" | **Research is running** · Results appear here when it finishes. `[Watch progress]` |
| **Completed** | `completed` | All cards populated | none |
| **Partial** | `partial` | Persistent warning banner; cards show results from the sources gathered | **Research stopped early** · We reached this run's budget limit, so results use the sources gathered so far. Treat gaps as unknown, not as absent. `[View what we found]` |
| **Failed, no earlier results** | `failed` | Error banner replaces the cards | **Research couldn't finish** · We stopped before producing results. Your idea is unchanged. `[Try again]` + reference ID |
| **Failed, earlier results exist** | `failed` after a completed run | Banner plus the previous results, labelled with their date | **Showing results from {date}** · The latest run couldn't finish. `[Try again]` |
| **Cancelled** | `cancelled` | Neutral banner, not an error | **Research was cancelled** · Nothing from this run is shown. `[Start again]` |
| **One card failed** | One region errors | Inline error in that card only | **We couldn't load this section** · `[Try again]` + reference ID |
| **Card empty** | Run finished, nothing found | Per-card finding | Risks: **No risks identified** · We didn't find any in the sources we checked. That doesn't prove none exist. Assumptions: **No open assumptions** |

## 5. Accessibility

- The score is real text with an accessible name: "Opportunity score 7.8 out of 10, 62 percent evidence coverage". Not an image or a bare ring.
- Each card is a labelled region; the order matches the visual order.
- Banners use `role="alert"` for failure and persist for partial; the running state uses `role="status"`.
- Skeletons set `aria-busy="true"` and respect `prefers-reduced-motion`.
- Count links announce their target: "9 verified claims, view in Evidence".

## 6. Handoff

**T28 (Prashant, Home UI):** reuse `EvidenceBadge` for the chips; new `ScoreSummary`, `ClaimCountChips`, `RiskList` in `packages/ui`.
**T32 (Avi, Overview endpoint):** please confirm the contract below.

## 7. Open questions

1. Overview contract: field names, and whether risks and assumptions arrive pre-sorted (what makes a risk "top"?).
2. After a failed run, does the endpoint return the previous completed run's score, or nothing?
3. Low-coverage threshold: at what coverage does the plain-language note appear?
4. Is the dimension breakdown part of Home, or only on Scorecard?
