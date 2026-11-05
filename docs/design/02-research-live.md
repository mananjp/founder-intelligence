# Research Live: state specification

| | |
|---|---|
| **Status** | v0 draft, for team review |
| **Owner** | Akanksha (Product Design), Sprint 2 task T29 / issue #68 |
| **Feeds** | T27 Research Setup + Live · T16 Orchestrator persistence |
| **Sources** | `ux-states.md` (Sprint 1 #19), Sprint 2 Plan |
| **Companion** | `02-research-live.html` shows the core states below |

**Legend:** **[Confirmed]** verified in code today · **[Planned]** in a Sprint 2 task · **[Proposed]** design recommendation.

All general rules (principles, error placement, copy, accessibility) come from `ux-states.md`. 

---

## 1. What the screen is for

This screen displays the real-time progress of a long-running AI research job (Server-Sent Events / SSE). Because runs take a long time, the UI must make the waiting feel productive, clearly state what is happening, and assure the founder they can leave the page safely.

**Layout [Proposed].** Desktop & Mobile: A single centered column containing a persistent status header, a progress timeline of pipeline stages, and a running metric counter (elapsed time and sources gathered). 

---

## 2. Technical Contracts & Behaviors

*   **Durable SSE [Planned]:** Driven by `GET .../runs/:runId` and Redis streams. If the connection drops, it reconnects using `Last-Event-ID`.
*   **Pipeline Stages [Planned]:** Scope → Plan → Discover → Fetch → Extract → Crosscheck → Recommend.
*   **Exempt from Timeout:** The SSE stream must *not* trigger the standard client timeout (`AbortController`), as it is expected to stay open for minutes.

---

## 3. Loading & Progress (The "Live" State)

**Rule:** No indefinite spinners. Progress is staged and metrics are visible. 

| Element | Treatment | Why |
|---|---|---|
| **Header Status** | "Researching your idea..." + "You can leave this page. We'll notify you when it's done." | Prevents users from feeling trapped on a loading screen. |
| **Live Metrics** | Elapsed time (e.g., "01:24") + Sources Gathered (e.g., "14 sources found"). | Shows tangible evidence that work is happening, making the wait tolerable. |
| **Stage Timeline** | List of the 7 stages. Completed stages get a green check. The active stage pulses gently. Future stages are muted. | Sets expectations for how far along the process is. |

---

## 4. Errors & Failures

Errors on this page are persistent banners, not transient toasts, because they represent the final state of a long-running job.

| Condition | Placement | Title · body | Action | Ref | Why / notes |
|---|---|---|---|---|---|
| **Budget Guard Hit (Partial)** | Persistent Banner (Warning) | **Research stopped early** · We reached this run's budget limit, so results use the N sources gathered so far. Treat gaps as unknown, not as absent. | View what we found | No | Translates the technical `budget_exceeded` into a usable state. |
| **Run Failed** | Persistent Banner (Error) | **Research couldn't finish** · We stopped before producing results. Your idea is unchanged. | Try again | **Yes** | Server crash or unrecoverable orchestrator failure. |
| **Offline** | Persistent Banner (Warning) | **You're offline** · We lost connection to the live feed, but research is still running on our servers. | None | No | Reconnects automatically when network returns. |

---

## 5. Actions & Completion

*   **Cancel Run:** A "Stop research" button is available while the run is active. Canceling yields a degraded/failed state banner. 
*   **Success Transition:** When the SSE stream emits the `completed` event, the UI automatically transitions to the Evidence Vault / Scorecard. No success toast is needed; the page change is the success state.