# Scorecard: state specification

| | |
|---|---|
| **Status** | v0 draft, for team review |
| **Owner** | Akanksha (Product Design), Sprint 2 task T29 / issue #68 |
| **Feeds** | T31 Scorecard module (API + UI) · ADR-0007 score ownership |
| **Sources** | `ux-states.md`, `packages/contracts/src/opportunity.ts`, `packages/scoring/src/opportunityScore.ts`, Bible §17, Sprint 2 Plan |
| **Companion** | `05-scorecard.html` shows every state below |

**Legend:** **[Confirmed]** in `packages/contracts` or `packages/scoring` today · **[Planned]** in a Sprint 2 task, no contract yet · **[Proposed]** design recommendation.

General rules come from `ux-states.md`.

---

## 1. Purpose and layout

A structured decision aid, not a measure of startup success (Bible §17). It shows the overall score, how much evidence stands behind it, and the ten dimensions that make it up. **Layout [Proposed]:** score summary on top, then a table of the ten dimensions, then a "How this is calculated" disclosure.

## 2. Data

| Field | Status |
|---|---|
| `overallScore` 0 to 10, one decimal; `evidenceCoverage` 0 to 1 | **[Confirmed]** |
| `dimensions`: a **partial** record of 10 keys; each has `score` 0 to 10, `evidenceCoverage` 0 to 1, `citedClaimIds[]` | **[Confirmed]** |
| `scoringModelVersion` (currently `opportunity-score.v1`) | **[Confirmed]** |
| Compute endpoint, who triggers it, response shape | **[Planned]** T31 |

**The ten dimensions** (labels and questions from Bible §17): Problem severity, Market attractiveness, Customer willingness, Competitive pressure, Differentiation, Timing, Monetization, Distribution feasibility, Defensibility, Execution fit. Each row has a "What this measures" disclosure with its Bible question.

**Not in the contract, so not in the design:** a delta from previous runs, "grade-A citation" percentages, and a risks-and-unlocks panel (all in the IA doc). Risks live on Home.

## 3. Rules that matter

1. **Overall score and coverage are never apart:** "7.1 / 10" with "53% evidence coverage" beside it.
2. **Each dimension shows score and coverage.** Numbers are real text; the bar is decoration.
3. **A missing dimension is "Not scored", never 0.** `dimensions` is partial, so a key can be absent. Copy: **Not scored** · No rating was produced for this dimension. (The contract doesn't say why a key is missing, so the copy doesn't guess.)
4. **Zero coverage is stated plainly:** **No supporting evidence** (a score with 0% coverage is a guess).
5. **Cited claims link to the Vault.** "5 claims" opens Evidence filtered to that dimension's `citedClaimIds`.
6. **Show the model version** in the disclosure, so a score can be traced to the method that produced it.

## 4. States

| State | Trigger | UI | Copy |
|---|---|---|---|
| **Route loading** | Navigating in | Skeleton of summary + 10 rows | none |
| **No research** | No completed run | Empty state | **No score yet** · The opportunity score is calculated from research evidence. Run research first. `[Set up research]` |
| **Ready to calculate** | Run finished, no score stored. Only if the user triggers compute **[Proposed]** | Empty state with action | **Your score isn't calculated yet** · Research is done. Calculate the score from its evidence. `[Calculate score]` |
| **Calculating** | POST compute in flight | Button reads **Calculating…**, disabled; region `role="status"` | **Calculating your score** |
| **Nothing to score** | Compute has no scorable dimension (`computeOpportunityScore` throws when given none) | Empty state | **Nothing to score yet** · FI couldn't rate any dimension from this research. `[Set up research]` |
| **Calculated** | Score returned | Summary plus table | none |
| **Partial run** | Run state `partial` | Persistent warning banner above the summary | **Research stopped early** · We reached this run's budget limit, so this score uses the sources gathered so far. Treat gaps as unknown, not as absent. |
| **Low coverage** | Coverage under a threshold **[Proposed]** | Plain sentence under the score | **Part of this score still rests on assumptions.** |
| **Compute failed** | 5xx, timeout, network | Region error; any earlier score stays | **We couldn't calculate your score** · That didn't work. Try again in a moment. `[Try again]` + reference ID |
| **Refresh failed** | Refetch fails with a score on screen | Keep the score, add notice | **Showing your earlier score** · We couldn't refresh it. `[Try again]` |
| **View-only** | 403 | Calculate action disabled with reason | **View-only access** · Your role in this workspace can't make changes. |

## 5. Accessibility

- Overall score has an accessible name: "Opportunity score 7.1 out of 10, 53 percent evidence coverage".
- The dimensions are a real `<table>` with `<th scope>`; the bar is `aria-hidden` since the number carries the meaning.
- "What this measures" is a button with `aria-expanded`.
- Claim links announce their target: "5 supporting claims for Problem severity, view in Evidence".
- Status regions use `role="status"`; failures use `role="alert"`; the partial banner persists. Colour is never the only signal.

## 6. Handoff

**T31:** new `ScoreSummary` (shared with Home), `DimensionTable` and `DimensionRow` in `packages/ui`.

## 7. Open questions

1. **Code and comment disagree.** The doc comment in `opportunityScore.ts` says coverage is "multiplied in, not just displayed beside" the score. By my reading, the function only computes a weighted mean of the scores and reports coverage separately, so a confident 9/10 with no evidence scores the same as a well-evidenced 9/10. If the comment is the intent, the function needs fixing; if the code is the intent, the comment is wrong. Needs an answer from the T14/ADR-0007 owners before this screen promises "evidence-weighted".
2. **Scale direction of `competitive_pressure`.** The Bible asks "How difficult is the competitive landscape?", so a high number could mean hard, which would reverse it against dimensions where high is good, inside a plain mean. Confirm which way it runs, then the row gets a caption such as "higher = less pressure".
3. Who triggers compute: automatic after a run, or the user (which makes "Ready to calculate" a real state)?
4. Can the Vault filter by claim ID? T3 only lists module and status filters.
5. Low-coverage threshold, and whether per-dimension rows get their own low-coverage note.
