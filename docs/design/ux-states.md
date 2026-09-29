# UX Guidance: Error, Empty & Loading States

| | |
|---|---|
| **Status** | v0 draft, for team review |
| **Owner** | Akanksha (Product Design), Sprint 1 issue #19 |
| **Feeds** | #16 typed `ApiError` · #17 error boundary / not-found / loading · #18 workspace + ideas states |
| **Sources** | `apps/api/src/middleware/errorHandler.ts`, `validate.ts`, `packages/ui/src/tokens.css`, Execution Blueprint §6, Sprint 1 plan |

**Legend:** **[Confirmed]** verified in code today · **[Planned]** in a Sprint 1 task, not merged yet · **[Proposed]** design recommendation, open to change.

---

## 1. Principles

1. **Evidence before confidence, in failure states too.** FI's promise is that every claim traces to evidence. A blank panel, a `0`, or a green tick that appears because data is missing breaks that promise. Always say what we know, what we don't, and why.
2. **Every state answers three things:** what happened, what it means for the founder's work, what they can do next. Never blame the user.
3. **System state and evidence state look different.** Claim statuses (`verified`, `conflicting`, `assumption`) carry research meaning. A network error must never look like a "conflicting" claim. See §7.
4. **Don't lose the user's work.** A failed submit keeps form values. A failed refetch keeps the stale data on screen with a notice.
5. **Unexpected errors show a reference ID** (`requestId`) so support can trace the exact request in logs.
6. **Not by colour alone.** Every state has an icon and text, and is announced to assistive tech (§8).

---

## 2. What the frontend actually receives

**[Confirmed]** Every API error uses one envelope:

```
{ error: { code, message, details?, requestId } }
```

**Codes visible in the API today** (`errorHandler.ts`, `validate.ts`):

| Status | `code` | Notes |
|---|---|---|
| 422 | `validation_failed` | `details` is Zod's `flatten()` output: `{ formErrors, fieldErrors }`. This is what enables per-field inline errors. |
| 500 | `internal` | Message is always the generic "Something went wrong". |

**[Planned]** 400 `INVALID_JSON` (#1), 403 RBAC denial (#4), 429 rate limit (#3), 401 handling (#16). Exact code strings for these are not final.

**Client-only failures have no envelope**, so `ApiError` must synthesize them: timeout (`AbortController`), network failure/offline, and non-JSON responses (e.g. a proxy returning an HTML 502). **[Proposed]** codes: `timeout`, `network`, `unknown`.

**Rules for the UI**
- **Key copy on `code`, fall back to `status`.** Server `message` strings are written for developers ("Invalid body"), not founders.
- **Never render the server `message` for 5xx.** It is generic at best and could leak internals at worst.
- The server `message` is a last-resort fallback for unrecognised 4xx codes only (this is the "no `error.message` fallbacks lost" requirement in #16).

---

## 3. Loading patterns

| Pattern | When | Treatment | Why |
|---|---|---|---|
| **Route loading** | Navigating to a page (`loading.tsx`) | Skeleton that matches the final layout (header, cards, list rows) | Prevents layout shift; tells the user the shape of what's coming |
| **Region loading** | One panel fetching inside a loaded page | Skeleton in that panel only; rest of page stays usable | One slow panel shouldn't block the page |
| **Refetch** | Data already on screen is refreshing | Keep stale data, add a subtle "Updating…" indicator | Blanking to a skeleton on every refresh feels broken |
| **Mutation pending** | Save, create, delete | Disable the triggering button, change its label ("Saving…"), keep form values | Prevents double-submits; keeps context |
| **Long-running: research run** | `research-setup` → `research-live` | Staged progress driven by the SSE stream, elapsed time, running count of sources gathered. No indefinite spinner | Runs take a long time (queued job, blueprint §6). A spinner gives no evidence anything is happening |

**Research run details [Proposed, stage names to confirm with the AI Research squad]**
- Show the pipeline stages the blueprint names: Scope → Plan → Discover → Fetch → Extract, then the reasoning stages.
- Tell the founder they can leave the page; the run continues server-side.
- Show what's been gathered so far. It makes waiting feel productive and makes a `partial` result understandable.

**Skeleton rules:** neutral shimmer, respects `prefers-reduced-motion` (static block instead), never shows fake data.

---

## 4. Empty states

An empty state is **not** an error, and "nothing found" is **not** the same as "not run yet".

| Type | Meaning | Treatment |
|---|---|---|
| **First use** | Nothing created yet | Explain what belongs here, one primary action |
| **No results** | Search/filter matched nothing | Echo the filter, offer "Clear filters" |
| **Not generated yet** | Depends on research that hasn't run | Explain the prerequisite, link to it |
| **Searched, found nothing** | Research ran and the result is genuinely empty | Treat as a **finding**: say what was searched, and that absence of evidence isn't proof of absence |
| **Not available yet** | One of the 13 stub modules, no API yet | Plain "coming later" message. Not an error. Coordinate with the IA doc (#20) |
| **No permission** | Viewer role can't do this | Separate from empty: see 403 in §5 |

**Anatomy:** icon → headline (what this is) → one-sentence body (why it's empty) → at most one primary action.

**First-pass screen map [Proposed, to refine with screenshots]**

| Screen | Empty state | Copy |
|---|---|---|
| Workspace home / ideas list | First use | **No ideas yet** — Add an idea and FI will build the evidence behind it. `[Add your first idea]` |
| Ideas list (filtered) | No results | **No ideas match these filters** `[Clear filters]` |
| Scorecard (before research) | Not generated yet | **No score yet** — The opportunity score is calculated from research evidence. Run research first. `[Set up research]` |
| Evidence (claim with no evidence) | Searched, found nothing | **No evidence found** — We searched N sources and found nothing that supports or contradicts this claim. It can't be marked verified until we do. |
| Competitors / Customers | Searched, found nothing | **No direct competitors found** — We didn't find any in the sources we searched. That doesn't prove none exist. |
| Radar, Copilot, Experiments, etc. (stubs) | Not available yet | **Coming soon** — This part of FI isn't available yet. |

> A score of `0` and "no score yet" are different facts. Never render a missing score as zero.

---

## 5. Error patterns

### 5.1 Where to show it

| Presentation | Use when | Why |
|---|---|---|
| **Inline (field)** | 422 with `fieldErrors` | The user fixes it right where the problem is |
| **Inline (region)** | One panel failed to load | Contains the failure; offers Retry without leaving the page |
| **Banner** | Persistent page-level conditions: offline, partial research run | Stays until the condition clears; toasts vanish, conditions don't |
| **Toast** | Result of a user action: mutation failed, rate limited | Non-blocking, tied to the action. Error toasts don't auto-dismiss; success toasts may |
| **Full page** | 404, unrecoverable render crash | Nothing else on the page can be trusted |
| **Redirect** | 401 | Session is gone; no page state is meaningful |

### 5.2 Catalogue and copy

| Condition & signal | Presentation | Title, body | Action | Ref ID |
|---|---|---|---|---|
| **Field validation** · 422 `validation_failed` [Confirmed] | Inline per field + form summary | Summary: "Check the highlighted fields." Field text is written per field in the UI (e.g. "Enter a name for your idea"). Zod's default text is never shown | Fix and resubmit; values preserved | No |
| **Malformed request** · 400 `INVALID_JSON` [Planned] | Toast | "That didn't go through" · "Something went wrong sending your changes. Try again." | Try again | **Yes**: this is a client bug, not user error |
| **Session expired** · 401 [Planned] | Redirect to sign-in with return URL, toast on arrival | "Your session expired" · "Sign in again to pick up where you left off." | Sign in | No |
| **No permission** · 403 [Planned] | Inline; disable the control and explain | "View-only access" · "Your role in this workspace can't make changes. Ask a workspace owner if you need edit access." | None | No |
| **Not found** · 404 | `not-found.tsx` (routes) or inline (resource) | "We can't find that" · "This page or idea doesn't exist, or you don't have access to it." | Go to workspace | No |
| **Rate limited** · 429 [Planned] | Toast | "Too many requests" · "Please wait a moment and try again." | Retry (disabled until `Retry-After` if sent) | No |
| **Server error** · 500 `internal` [Confirmed] | Region error, or boundary if it broke the page | "Something went wrong on our side" · "That didn't work. Try again in a moment." | Try again | **Yes** |
| **Timeout** · client `timeout` [Proposed] | Toast or region | "This is taking longer than expected" · reads: "You can wait or try again." **For saves:** "Your change may have gone through. Refresh to check before trying again." | Try again / Refresh | **Yes** |
| **Offline** · client `network` [Proposed] | Persistent banner, clears itself | "You're offline" · "Changes won't save until your connection is back." | None (auto) | No |
| **Unknown / non-JSON** · client `unknown` | As 500 | As 500 | Try again | **Yes** |
| **Research failed** [Proposed, state name TBC] | Banner on `research-live` | "Research couldn't finish" · "We stopped before producing results. Your idea is unchanged." | Try again | **Yes** |
| **Research partial** (budget guard → `partial`, blueprint §6) | Persistent banner on every screen showing that run's results | "Research stopped early" · "We reached this run's budget limit, so results use the N sources gathered so far. Treat gaps as unknown, not as absent." | View what we found | No |

**Why two of these matter**
- **Timeout on a save:** the server may have completed the request. Telling the user to retry blindly risks duplicates (two ideas, two decisions).
- **404 and 403 for other people's resources:** using the same "doesn't exist, or you don't have access" wording avoids confirming that a resource exists in someone else's workspace. Confirm the backend returns 404 there (§10).

**Reference ID display:** small, muted, copyable: "Reference: `<requestId>`". Never inside a headline.

### 5.3 Error boundaries (for #17)

- **Segment `error.tsx`:** one broken panel or route segment shouldn't blank the whole workspace. Shows title, body, **Try again** (calls `reset`), **Go to workspace**, and reference ID.
- **Root `global-error.tsx`:** last resort for a crash in the root layout. Must render its own `<html>`/`<body>`, so keep it minimal and use tokens inline-safe.
- **`not-found.tsx`:** see 404 row.
- **Boundaries don't catch event-handler or async errors.** Those must flow through `ApiError` → toast or inline (§5.1). This is why #16 and #17 have to be designed together.

---

## 6. Copy guidelines

- **Calm and specific.** No "Oops", no exclamation marks, no blame ("You entered an invalid…").
- **"We" for system faults, "you" for what they can do.** "We couldn't save that. Try again."
- **Say what we know.** "We found no evidence" beats "There is no evidence". The first is a statement about our search; the second is a claim about the world.
- **No codes or jargon in body text.** `validation_failed` never appears on screen. The reference ID is the only technical string.
- **Buttons are verb + object:** "Set up research", "Clear filters", "Try again".
- **Sentence case.** Titles short enough to fit one line on mobile.
- **Don't promise what we can't guarantee.** Avoid "Your work is saved" unless the state truly guarantees it.

---

## 7. Tokens

**Existing** in `packages/ui/src/tokens.css`: `--fi-bg`, `--fi-surface`, `--fi-text`, `--fi-muted`, `--fi-accent`, `--fi-verified`, `--fi-conflicting`, `--fi-assumption`, `--fi-radius`, font families. The file itself notes the palette is a placeholder pending Design.

**Constraint:** the status tokens mean *research findings*, and the accent is documented as "evidence links / primary actions only". So:
- Don't use `--fi-conflicting` (red) for system errors, `--fi-verified` (green) for "saved" toasts, or `--fi-accent` for info banners.
- Use separate feedback tokens, and separate shapes: claim statuses are **chips on claims**; system feedback is **banners, toasts, inline messages with an icon**.

**Proposed additions** (values to be chosen by Design; each must meet WCAG AA contrast against `--fi-bg` and `--fi-surface`, and this has not been measured yet):

| Token | Role |
|---|---|
| `--fi-danger` | System error text/icon/border |
| `--fi-warning` | Partial results, degraded state |
| `--fi-success` | Transient "saved" confirmation |
| `--fi-info` | Neutral notices |
| `--fi-border` | Dividers, input and card outlines |
| `--fi-skeleton-base`, `--fi-skeleton-highlight` | Loading placeholders |
| `--fi-focus-ring` | Keyboard focus, error summary focus |
| `--fi-overlay` / toast elevation | Toast layer above content |

Also missing: tokens for the `unverified` and `inferred` claim statuses that the evidence engine produces. That belongs with the Evidence screens, but flag it now.

**Process:** add tokens in a **separate commit or PR** from this doc. `packages/ui` is shared with Frontend, and small PRs can be reviewed and reverted independently.

---

## 8. Accessibility

- Errors: `role="alert"`. Loading and success: `role="status"` (polite).
- On failed submit, move focus to the form summary or first invalid field.
- Loading regions get `aria-busy="true"`.
- Every state has an icon and text; colour is never the only signal.
- Shimmer respects `prefers-reduced-motion`.
- Toasts must be reachable by keyboard and not vanish before they can be read (errors persist).

---

## 9. Handoff notes

**#16 `ApiError` (Prashant)**
- Fields: `status`, `code`, `message`, `requestId`, `details`. Synthesize `timeout`, `network`, `unknown` for client-only failures.
- **The SSE stream for `research-live` must be exempt from the request timeout.** A timeout tuned for normal calls would kill a healthy long-running stream.
- 401: redirect to sign-in and preserve the return URL.
- Map UI copy by `code` from §5.2, never by parsing `message`.

**#17 boundaries and loading (Varun)**
- In Next.js App Router the idiomatic tools are `error.tsx`, `global-error.tsx`, `not-found.tsx`, `loading.tsx`. Prefer these to a hand-rolled `ErrorBoundary` in `layout.tsx`, or confirm why one is needed.
- Skeletons match the final layout of each route (§3).

**#18 workspace and ideas (Aanshi)**
- Use the presentation table (§5.1) to choose toast vs inline vs banner.
- Empty states for the ideas list: first use vs filtered (§4).
- Use feedback tokens from §7 once added; don't borrow claim-status colours.
