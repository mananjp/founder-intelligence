# Interview: state specification

| | |
|---|---|
| **Status** | v0 draft, for team review |
| **Owner** | Akanksha (Product Design), Sprint 2 task T29 / issue #68 |
| **Feeds** | T25 Adaptive Interview UI · T4 Interview API · T12 AI interview turn · T26 app shell (viewer role) |
| **Sources** | `packages/shared/.../interview.ts` (Zod contracts), `ux-states.md` (Sprint 1 #19), `packages/ui/src/tokens.css`, Sprint 2 plan |
| **Companion** | `01-interview.html` shows every state below, built from the tokens |

**Legend:** **[Confirmed]** verified in code today · **[Planned]** in a Sprint 2 task, not merged · **[Proposed]** design recommendation, open to change · **[Open]** needs an answer from another squad (§9).

All general rules (principles, error placement, copy, accessibility) come from `ux-states.md` and are not repeated here. This file only says how they apply to the Interview screen.

---

## 1. What the screen is for

A founder describes their idea. The AI asks one follow-up question at a time until it has enough to write a **research brief**. The founder reviews the brief and confirms it, which unlocks Research Setup.

Four regions. They are specified separately because **they fail independently** (ux-states §3: one slow panel must not block the page).

| Region | Job |
|---|---|
| **A. Transcript** | The conversation so far, ordered by `turnIndex` |
| **B. Composer** | Where the founder types the next answer |
| **C. Captured details** | Which brief fields the AI has resolved, which are still missing |
| **D. Brief preview** | The draft brief, shown once there is something to show, with confirm |

**Layout [Proposed].** Desktop: A + B in the main column, C as a side panel. Mobile: C collapses to one line above the composer ("4 of 7 captured") that opens a sheet. *Why:* on a phone the transcript needs the full width; the founder only needs the detail list when they ask for it.

---

## 2. What the frontend receives

**[Confirmed]** from `interview.ts`:

| Contract | Fields that matter to the UI |
|---|---|
| `InterviewTurn` | `role` (`founder` \| `assistant`), `content`, `turnIndex`, `createdAt` (**optional**), `extracted` |
| `PostInterviewTurnBody` | `content` min 1, max 10 000 chars; optional `finalize` |
| `PostInterviewTurnResponse` | `founderTurn` and `assistantTurn` **together**, `extractedVariables`, `isComplete`, optional `draftBrief`, optional `finalizedBrief` |
| `InterviewSessionState` | `turns[]`, `extractedVariables`, `isComplete`, `latestBrief` (nullable) |
| `ResearchBrief` | `version`, 7 content fields (nullable), `geography[]`, `knownEvidence[]`, `unknowns[]`, `researchQuestions[]` |
| `FinalizeInterviewBriefBody` | Every brief field nullable: the founder can submit edits when confirming |

**Design decisions that follow from the contracts**

| # | Decision | Why |
|---|---|---|
| D1 | Order the transcript by `turnIndex`, never `createdAt` | `createdAt` is optional, so sorting on it can silently fail |
| D2 | Drive region C from the typed brief fields (`draftBrief` / `latestBrief`), **not** `extractedVariables` | `extractedVariables` is `Record<string, unknown>`: the keys are not guaranteed, so a UI built on them breaks when the prompt changes |
| D3 | The 7 "captured details" are `problem`, `customer`, `geography`, `category`, `alternatives`, `businessModel`, `differentiation` **[Proposed]**. `knownEvidence`, `unknowns`, `researchQuestions` are shown in the brief preview only | The founder answers the first 7. The other three are the AI's output |
| D4 | `null`, `undefined` and `[]` all mean **not captured**, never "answered with nothing" | Principle 1: a blank must never look like an answer |
| D5 | `POST` returns both turns in one response, so the founder's own message **cannot be confirmed until the AI has replied** | This forces an optimistic bubble (§5, row `send-fail`) |

---

## 3. Loading

| Pattern | Where | Treatment | Why |
|---|---|---|---|
| **Route load** | `GET …/interview` | Skeleton: 3 message placeholders alternating sides, side-panel rows, composer present but **read-only** | Shape matches the final layout, so nothing jumps. Composer is locked so nobody types an answer without seeing the history |
| **Assistant reply pending** | After send | Founder's bubble shows at once (marked "Sending…"). Below it a status line "Thinking about your answer…" with an icon. Static dots under `prefers-reduced-motion` | The LLM call takes seconds. An empty gap feels broken |
| **Slow reply** **[Proposed]** | After ~15 s | Line changes to "Still working on a reply. You can keep waiting." No retry button yet | Retrying while the first request is alive would create a duplicate turn. Tune the threshold against T12's real latency |
| **Send pending** | Composer | Button disabled and relabelled "Sending…". Textarea becomes `readonly` (not `disabled`) and keeps its text | `readonly` keeps focus and screen-reader context. Principle 4: values are kept |
| **Refetch** | Tab refocus or manual refresh | Transcript stays. Small "Updating…" in the transcript header (`role="status"`) | ux-states §3 |
| **Confirm pending** | Brief preview | Button "Confirming…", fields stay visible | Prevents a double confirm, which would create two brief versions |

Skeletons: neutral shimmer, never fake text, static block under `prefers-reduced-motion`.

---

## 4. Empty and partial-data states

| State | Type (ux-states §4) | Headline · body | Action |
|---|---|---|---|
| **No turns yet** **[Open Q1]** | First use | **Tell us about your idea** · Describe it in a few sentences. FI will ask follow-up questions, one at a time, to build your research brief. | None. The composer is the one action |
| **Captured details, nothing yet** | Not generated yet | Rows read **Not captured yet**, count reads "0 of 7 captured" | None |
| **A single brief field is null** | Not generated yet | **Not captured yet** (dashed-circle icon + text) | None |
| **`unknowns` is empty** | Searched, found nothing | **None recorded.** Never "None exist" | None |
| **Brief not ready** | Not generated yet | **No brief yet** · FI writes your brief from your answers. Keep answering to fill the gaps. | None |
| **Interview complete, not confirmed** | n/a | Info notice: **Your brief is ready to review** · Check it, edit anything that's wrong, then confirm. | Confirm brief |
| **Interview confirmed (brief v N)** **[Open Q4]** | n/a | Transcript read-only. Notice: **Brief confirmed (version N)** | Set up research |

Rule: "0 of 7 captured" is a real count, so it is fine. A progress **bar** at 0 % is not used: it implies a measured percentage the AI never produced.

---

## 5. Errors

Copy is keyed on `code`, then `status`. The server `message` is never shown for 5xx. Reference ID format: small, muted, copyable "Reference: `<requestId>`".

| ID | Condition & signal | Placement | Title · body | Action | Ref | Why / notes |
|---|---|---|---|---|---|---|
| `val-empty` | Empty answer, 422 `validation_failed` on `content` **[Confirmed]** | Inline under composer + summary | Summary: **Check the highlighted field.** Field: **Enter your answer** | Fix, resend | No | Zod's text is never shown. Client checks first, server stays authoritative |
| `val-long` | `content` over 10 000 chars **[Confirmed]** | Inline under composer | **Shorten your answer to 10,000 characters or fewer.** Counter shows from 9 000: "9,412 / 10,000" | Edit | No | Text and number, not colour alone. **Never truncate silently** |
| `val-brief` | 422 on confirm (brief edit mode) **[Confirmed]** | Inline per brief field + summary | Summary: **Check the highlighted fields.** | Fix, resubmit | No | `details.fieldErrors` keys map to brief fields |
| `400` | `INVALID_JSON` **[Planned]** | Toast | **That didn't go through** · Something went wrong sending your answer. Try again. | Try again | **Yes** | A client bug, not user error. Draft kept |
| `401` | Session expired **[Planned]** | Redirect with return URL, toast on arrival | **Your session expired** · Sign in again to pick up where you left off. | Sign in | No | **Save the unsent draft before redirecting [Proposed]**, keyed per idea, cleared on successful send (principle 4) |
| `403` | Viewer role **[Planned]** | Inline, replaces composer | **View-only access** · Your role in this workspace can't make changes. Ask a workspace owner if you need edit access. | None | No | Transcript stays readable. Confirm brief is also disabled with the same explanation |
| `404` | Idea or interview not found | `not-found.tsx` | **We can't find that** · This page or idea doesn't exist, or you don't have access to it. | Go to workspace | No | Same wording for "missing" and "not yours" |
| `429` | Rate limited **[Planned]** | Toast | **Too many requests** · Please wait a moment and try again. | Retry (disabled until `Retry-After`) | No | Each turn costs an LLM call, so this is likely to appear here first |
| `send-fail` | 500 `internal` or client `unknown` on send **[Confirmed]** | Inline above composer | **Something went wrong on our side** · That didn't work. Try again in a moment. | Try again | **Yes** | **Remove the optimistic bubble and put the text back in the composer.** A "failed" bubble would imply the server never saw it, which we can't know (see timeout) |
| `send-timeout` | Client `timeout` on send **[Proposed]** | Inline above composer; bubble stays as "Not confirmed" | **This is taking longer than expected** · Your answer may have been sent. Refresh to check before sending it again. | Refresh conversation | **Yes** | T4 persists turns before calling the AI, so the server may have finished. Refresh reconciles: turn found → drop the draft; not found → restore it to the composer |
| `no-reply` | Founder turn saved, assistant turn missing **[Open Q2]** | Inline at end of transcript | **We haven't replied yet** · Your last answer was received, but we couldn't write a follow-up question. | Get a reply | **Yes** | Needs a backend way to ask for a reply without creating a second founder turn |
| `confirm-fail` | 500 / unknown on confirm | Toast (action result), does not auto-dismiss | **We couldn't confirm your brief** · That didn't work. Try again in a moment. | Try again | **Yes** | |
| `confirm-timeout` | Timeout on confirm | Toast | **This is taking longer than expected** · Your brief may have been confirmed. Refresh to check before trying again. | Refresh | **Yes** | Confirm creates a brief version, so a blind retry duplicates it |
| `load-fail` | `GET` session fails on first load | Region error replaces transcript | **Something went wrong on our side** · That didn't work. Try again in a moment. | Try again | **Yes** | Composer stays locked |
| `stale` | Refetch fails with data on screen | Inline notice above transcript | **We couldn't refresh this conversation** · You're seeing what we loaded earlier. | Try again | **Yes** | Principle 4. Composer stays usable |
| `offline` | Client `network` **[Proposed]** | Persistent banner, clears itself | **You're offline** · Changes won't save until your connection is back. | None | No | Draft kept. Send button disabled, banner linked via `aria-describedby` |

---

## 6. Brief preview and confirm

- Shows the 7 fields, then `unknowns`, `researchQuestions`, `knownEvidence`. Null fields use "Not captured yet" (D4).
- **Edit brief** toggles fields to editable (`FinalizeInterviewBriefBody` allows it) **[Proposed]**. Edits submit with confirm.
- Primary button: **Confirm brief**. After success the app moves to Research Setup. No success toast: the page change is the confirmation, and we avoid saying "saved" (ux-states §6).
- **Finishing early [Open Q3]:** `PostInterviewTurnBody.finalize` suggests the founder can end the interview before `isComplete`. If allowed, the button is **Finish interview** and the body must say: "N of 7 details are still missing. Research will treat them as unknown." This applies principle 1: gaps are unknown, not absent.
- `geography` matters downstream: `StartResearchRun` requires at least one. Do **not** block confirm on it (Setup has its own geography field) but mark it clearly if missing.

---

## 7. Tokens

Use only existing tokens. Claim-status colours (`--fi-verified`, `--fi-conflicting`, `--fi-assumption`) and `--fi-accent` are **never** used for system feedback or for chat bubbles (ux-states §7).

| Element | Token(s) |
|---|---|
| Page / panels | `--fi-bg` / `--fi-surface`, outline `--fi-border` |
| Body text / secondary text | `--fi-text` / `--fi-muted` |
| Founder bubble | `--fi-overlay` fill + `--fi-border-strong`, right-aligned, label "You" |
| Assistant message | Left-aligned, FI icon, label "FI" (not distinguished by colour alone) |
| Primary button | `--fi-accent-strong` fill, `--fi-on-accent` text |
| Links, focus | `--fi-accent-text`, `--fi-focus-ring` |
| Error | `--fi-danger`, `--fi-danger-bg` |
| Warning (slow, reconnecting) | `--fi-warning`, `--fi-warning-bg` |
| Neutral notices (complete, view-only) | `--fi-text` on `--fi-overlay` with `--fi-border-strong` |
| Skeleton | `--fi-skeleton-base`, `--fi-skeleton-highlight` |
| Text input outline | **`--fi-border-input` (proposed, see below)** |

**Contrast, measured with the WebAIM checker** (all on `--fi-surface` #161B22 unless noted):

| Pair | Ratio | Result |
|---|---|---|
| `--fi-text` #E8ECF1 | 14.57 | AA + AAA |
| `--fi-muted` #8A93A3 | 5.58 | AA |
| `--fi-accent-text` #6F8FFF | 5.8 | AA |
| `--fi-danger` #FF7B72 | 6.86 | AA |
| `--fi-warning` #F0883E | 6.83 | AA |
| `--fi-on-accent` #FFF on `--fi-accent-strong` #3059F0 | 5.5 | AA |

**Not yet measured, must be checked before this spec is final:**

1. `--fi-danger` and `--fi-warning` text on their own tinted backgrounds (`--fi-danger-bg`, `--fi-warning-bg` over surface). My arithmetic says about 5.7:1 for both; confirm with the checker using the blended colour.
2. `--fi-accent-text` on `--fi-info-bg` (about 4.8:1 by my arithmetic).
3. Every text colour against `--fi-bg` #0E1116 (ux-states requires both backgrounds). Likely fine, since bg is darker, but it is unmeasured.
4. **Non-text contrast (WCAG 1.4.11, 3:1).** `--fi-border` (8 % white) is about **1.25:1** on surface. It is fine for card dividers but **fails as the only outline of a text input**. Proposed `--fi-border-input` around `#5F6877` (about 3.1:1 by my arithmetic, verify). `--fi-accent-strong` button fill against surface is about 3.1:1, which is borderline, so verify it too.

---

## 8. Accessibility

- Transcript: `role="log"`, `aria-live="polite"`, so new assistant messages are announced without moving focus.
- "Thinking…" and "Sending…": `role="status"`. Errors and failed states: `role="alert"`.
- Region loading: `aria-busy="true"` on the region. Skeleton blocks are `aria-hidden`.
- **Failed send:** focus moves to the inline error (or the first invalid field for `val-*`). Successful send: focus stays in the composer.
- Captured details: each row is text ("Captured" / "Not captured yet") plus an icon, never a coloured dot alone.
- Composer **[Proposed]:** Enter inserts a new line, Ctrl/Cmd + Enter sends, with a visible hint. *Why:* answers are paragraphs and a mis-sent answer costs an LLM call. This departs from chat convention, so confirm with the team.
- Character counter is not a live region except at the 9 000 and 10 000 thresholds.
- Touch targets 44 px on mobile. Visible `--fi-focus-ring` on every control. `prefers-reduced-motion` removes shimmer and animated dots.

---

## 9. Handoff and open questions

**For T25 (Aanshi)**
- Build against the fixture until T4 lands, but model `send-fail`, `send-timeout`, `no-reply` from day one. They change the data flow, not just the styling.
- Use optimistic bubbles with reconciliation by `turnIndex` (D1, D5).
- Copy keys on `code`. Strings come from this spec, not from the server.

**Open questions**

| # | Question | Ask |
|---|---|---|
| Q1 | Who sends the first turn? `AiInterviewTurnPayload.founderMessage` is required, so either the API seeds turn 0 from the idea's `rawDescription`, or the founder writes first | T4 owner |
| Q2 | If the API saves the founder turn and the AI call then fails, what does a retry do? Is there a way to request a reply without a duplicate founder turn? | T4 owner |
| Q3 | Can the founder finish before `isComplete`? (`finalize` on the turn body suggests yes) | T4 / T12 |
| Q4 | How does `GET` distinguish "complete, unconfirmed" from "confirmed"? Is `latestBrief != null` the signal? | T4 |
| Q5 | `--fi-success` and `--fi-info` are in ux-states §7 but not in `tokens.css`. Dropped on purpose? This spec needs neither | Design |
