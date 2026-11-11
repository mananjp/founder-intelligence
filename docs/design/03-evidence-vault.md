# Evidence Vault: state specification

| | |
|---|---|
| **Status** | v0 draft, for team review |
| **Owner** | Akanksha (Product Design), Sprint 2 task T29 / issue #68 |
| **Feeds** | T28 Evidence Vault + Home · T3 Evidence module |
| **Sources** | `ux-states.md`, `packages/contracts/src/evidence.ts`, Bible §10 and §27, Sprint 2 Plan |
| **Companion** | `03-evidence-vault.html` shows every state below |

**Legend:** **[Confirmed]** in `packages/contracts` today · **[Planned]** in a Sprint 2 task, no contract yet · **[Proposed]** design recommendation.

General rules (principles, error placement, copy, accessibility) come from `ux-states.md`.

---

## 1. Purpose and layout

The Vault answers "why should I believe this?" for every claim FI makes. **Layout [Proposed]:** filter bar, then a claims table; selecting a row opens a **source drawer** (side panel on desktop, full-screen sheet on mobile). A **contradictions view** lives inside the drawer for `conflicting` claims.

## 2. Data

| Field | Status |
|---|---|
| `Claim`: `id`, `statement`, `module`, `status`, `evidenceIds[]` | **[Confirmed]** |
| `module`: market, customer, competitive, demand, pricing, gtm | **[Confirmed]** |
| `status`: verified, supported, directional, conflicting, inferred, assumption, unverified | **[Confirmed]** |
| Evidence/source fields for the drawer (verbatim quote, source title, publisher, URL, source type, publication date, access date) | **[Planned]** T3 `GET …/claims/:id`; no Zod shape yet. Bible §10 lists them. |
| Contradiction links between claims or sources | **[Planned]** T3 |

`SourceType` has 13 values (**[Confirmed]**); each needs a human label ("Official site", "Government", "Job posting"…), never the raw enum.

**Not in the contract, so not in the design:** a numeric confidence score, "disputed", "stale", "grade-A" or domain credibility tiers (all mentioned in the IA doc). Use the 7 real statuses only.

## 3. States

| State | Trigger | UI | Copy |
|---|---|---|---|
| **Route loading** | Navigating in | Skeleton of filter bar + 8 table rows | none |
| **Not generated yet** | No run for this idea | Empty state, one action | **No evidence yet** · Evidence appears after research runs. `[Set up research]` |
| **Run in progress** | Run state before claims exist | Info empty state linking to Live. Not "found nothing" | **Research is still running** · Claims appear here once they've been cross-checked. `[Watch progress]` |
| **Populated** | Claims returned | Table, see §4 | none |
| **Filtered, no match** | Filters match zero | Echo the filters | **No claims match these filters** `[Clear filters]` |
| **Partial run** | Run state `partial` | Persistent warning banner above the table | **Research stopped early** · We reached this run's budget limit, so claims use the sources gathered so far. Treat gaps as unknown, not as absent. |
| **Table load failed** | 5xx, timeout, network | Region error in place of rows; filters stay | **Something went wrong on our side** · That didn't work. Try again in a moment. `[Try again]` + reference ID |
| **Stale data on refetch** | Refetch fails with rows on screen | Keep rows, add notice | **Showing earlier results** · We couldn't refresh this list. `[Try again]` |

## 4. Claims table

Columns: **Claim** (statement, the row's button), **Module**, **Status** (`EvidenceBadge`), **Evidence** (count from `evidenceIds.length`). Filters: module and status (T3 supports both), each option showing its count, plus a live "N claims" readout. Never hide the badge (Bible §27). Mobile: rows become cards, badge first.

**Default order [Proposed, confirm with T3]:** `conflicting`, then `unverified`, then the rest. Uncertainty is shown first, not buried.

**Badge changes [Proposed, verify with a contrast checker]:** `conflicting` text (#d9534f) is about 4.4:1 on `--fi-surface` and `inferred` (`--fi-accent`) about 3.9:1, both under the 4.5:1 AA minimum for 12px text. Add `--fi-conflicting-text: #ef6f6a` (about 5.9:1) and use `--fi-accent-text` for `inferred`. Add a distinct glyph per status so `verified` and `supported`, which share a colour, differ by more than one word.

## 5. Source drawer

Opens on row select. Header: the full claim statement and its badge. One block per evidence item:

- **Verbatim quote** in a blockquote. The T20 gate guarantees it is verbatim, so never edit it. For long quotes use "Show more", not "…" truncation.
- **Source**: title, publisher, human source-type label, link ("opens in new tab").
- **Dates**: published and accessed. A missing date reads **Publication date unavailable**, never blank.

| Drawer state | Copy |
|---|---|
| Loading | Skeleton of two evidence blocks |
| Failed | **We couldn't load the evidence** · Try again. `[Try again]` + reference ID. The table behind stays usable. |
| `assumption` | **This is an assumption** · It hasn't been tested yet. `[Plan an experiment]` is out of scope until T33 ships; omit the action meanwhile. |
| Zero evidence, not an assumption | **No evidence found** · We searched the sources we gathered and found nothing that supports or contradicts this claim. It can't be marked verified until we do. |
| `inferred` | **Derived by FI** · This conclusion was inferred from the evidence below, not stated by a source. |

## 6. Contradictions view

For `conflicting` claims. Two or more sources side by side, **equal visual weight**, each with its quote, source and date. FI doesn't pick a winner. Add one line on why they may differ only if the API supplies it. Empty: **No contradictions found among the sources we checked.** (A statement about our search, not the world.)

## 7. Accessibility

- Semantic `<table>` with `<th scope>`; the row's button is the claim statement.
- Drawer: `role="dialog"`, `aria-modal`, labelled by the claim; focus moves to its heading, is trapped, Esc closes, focus returns to the row.
- Filters: native labelled controls. A `role="status"` readout announces "N claims" after each change.
- Status is never colour alone: glyph plus text. Skeleton shimmer respects `prefers-reduced-motion`.
- Errors use `role="alert"`; the partial banner persists.

## 8. Handoff and open questions

**T28 (Prashant):** reuse `EvidenceBadge`; new `ClaimsTable`, `SourceDrawer`, `ContradictionPair` in `packages/ui`.
1. T3 evidence and contradiction field names, so the drawer matches the real shape.
2. Does the API stream claims during a run, or only after crosscheck?
3. Does it expose the number of sources searched, for the "No evidence found" copy?
4. Default sort, as proposed in §4.
5. T20 and T21 are in review on other branches and may change how statuses and quotes arrive. Re-check this spec once they merge.
