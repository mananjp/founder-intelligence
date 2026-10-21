# Information Architecture: Founder Intelligence Modules

**Status**: Baseline (Sprint 1 WS6 #20)  
**Author**: Product Design & Architecture Squad  
**Target Delivery**: Unblocks Sprint 2 Pod implementations (Pod A, Pod B, Pod C)

---

## 1. Executive Summary & Navigation Topology

Founder Intelligence (FI) organizes intelligence along two primary contexts:
1. **Workspace Context** (`/workspace/:workspaceId`): Cross-idea portfolios, team membership, billing, settings, and workspace-level activity.
2. **Idea Context** (`/workspace/:workspaceId/ideas/:ideaId`): Deep evidence-backed intelligence lifecycle for an individual venture or hypothesis.

### Hierarchy Diagram

```
/ (Landing Page / Auth)
├── /login, /welcome, /pricing
└── /workspace/:workspaceId (Portfolio Dashboard)
    ├── /ideas (Idea Listing & Metrics)
    ├── /ideas/new (Hypothesis Entry Wizard)
    └── /ideas/:ideaId (Idea Master View)
        ├── /scorecard       [Pod A]
        ├── /research-setup  [Core Research]
        ├── /research-live   [Core Research]
        ├── /evidence        [Core Research]
        ├── /market          [Pod C]
        ├── /competitors     [Pod C]
        ├── /customers       [Pod C]
        ├── /assumptions     [Pod A]
        ├── /experiments     [Pod A]
        ├── /decisions       [Pod A]
        ├── /reports         [Pod B]
        ├── /radar           [Pod C]
        ├── /copilot         [Intelligence]
        └── /history         [Audit Trail]
```

---

## 2. Global Navigation & Page Shell

Each Idea sub-page inherits a unified layout shell with:
- **Header**: Workspace picker, Idea title breadcrumb, Research run trigger, Score badge, Share/export.
- **Side Nav**: Grouped by stage of discovery:
  - *Evaluation*: Scorecard, Evidence Vault, Copilot
  - *Research*: Setup, Live Run, Market, Competitors, Customers
  - *Validation*: Assumptions, Experiments, Decisions
  - *Monitoring & Output*: Reports, Radar, History

---

## 3. The 13 Feature Modules: Detailed Information Architecture

### 1. Scorecard (`/scorecard`)
- **Pod**: Pod A (Decisions & Scorecard)
- **Purpose**: High-level synthetic viability assessment across market, moat, execution risk, and timing.
- **Key Sections**:
  - *Composite Opportunity Score*: 0–100 weighted index with delta from previous research runs.
  - *Dimension Breakdowns*: Market Size, Problem Severity, Willingness to Pay, Competitive Moat, Execution Friction.
  - *Confidence Meter*: Percentage of claims backed by grade-A citations.
  - *Top Risks & Unlocks*: Highlighted friction points requiring immediate experiment validation.
- **Contract Dependencies**: `@fi/contracts` `OpportunityScore`, `ScoreDimension`.

### 2. Research Setup (`/research-setup`)
- **Pod**: Core AI Research Engine
- **Purpose**: Configure depth, focus questions, and search boundaries before launching an AI intelligence run.
- **Key Sections**:
  - *Depth Selector*: Quick ($1.00), Standard ($4.00), Deep ($12.00) matching token/cost budgets.
  - *Target Dimensions*: Toggles for TAM estimation, Competitor tearing, Pricing analysis, Customer interviews.
  - *Custom Queries & Exclusions*: User-specified competitor URLs or domain restrictions.
- **Contract Dependencies**: `ResearchRunConfig`, `BudgetTier`.

### 3. Research Live (`/research-live`)
- **Pod**: Core AI Research Engine
- **Purpose**: Real-time streaming observation of pipeline stages as agents discover, scrape, and synthesize.
- **Key Sections**:
  - *Stage Stepper*: Scope → Plan → Discover → Fetch → Extract → Crosscheck → Synthesize → Recommend.
  - *Live SSE Feed*: Real-time log emissions and search source citations as discovered.
  - *Cost & Token Meter*: Live cumulative spend against run budget.
- **Contract Dependencies**: `ResearchRunStatus`, `SSEProgressEvent`.

### 4. Evidence Vault (`/evidence`)
- **Pod**: Core AI Research Engine / Reasoning
- **Purpose**: Filterable repository of all verified claims, primary source URLs, quotes, and freshness timestamps.
- **Key Sections**:
  - *Claims Ledger*: Claim statement, confidence score (0-1), supporting & contradicting source badges.
  - *Primary Source Catalog*: Scraped URLs, domain credibility tiers, snapshot excerpts.
  - *Quality Gate Badges*: Indicators for verified, disputed, or stale data points.
- **Contract Dependencies**: `EvidenceItem`, `ClaimVerification`.

### 5. Market & TAM (`/market`)
- **Pod**: Pod C (Radar & Market Intelligence)
- **Purpose**: Bottom-up and top-down market sizing, growth drivers, tailwinds/headwinds, and regulatory landscape.
- **Key Sections**:
  - *TAM / SAM / SOM Visualizer*: Sizing assumptions with explicit formula breakdowns.
  - *Market Tailwinds & Catalysts*: Technological shifts, regulatory tailwinds, cultural trends.
  - *Adjacent Segments*: Expansion paths once initial niche is captured.
- **Contract Dependencies**: `MarketAnalysis`, `TAMCalculation`.

### 6. Competitors Matrix (`/competitors`)
- **Pod**: Pod C (Radar & Market Intelligence)
- **Purpose**: Direct, indirect, and status-quo competitors analyzed across feature parity, pricing, and positioning.
- **Key Sections**:
  - *2x2 Positioning Matrix*: Dynamic axis positioning based on user-selected criteria.
  - *Competitor Dossiers*: Funding, estimated revenue, weaknesses highlighted by user reviews, tech stack.
  - *Moat & Differentiation Wedge*: Clear strategic angle against incumbent inertia.
- **Contract Dependencies**: `CompetitorProfile`, `DifferentiationWedge`.

### 7. Customers & ICP (`/customers`)
- **Pod**: Pod C (Radar & Market Intelligence)
- **Purpose**: Persona profiles, pain point severity, current workarounds, and willingness-to-pay signals.
- **Key Sections**:
  - *Ideal Customer Profile (ICP)*: Industry, company size, buyer vs. user personas.
  - *Jobs-to-be-Done (JTBD)*: Functional, emotional, and social jobs with switching cost analysis.
  - *Interview Synthesis*: Aggregate quotes and validation signals from founder customer conversations.
- **Contract Dependencies**: `CustomerPersona`, `JTBDItem`.

### 8. Assumptions Board (`/assumptions`)
- **Pod**: Pod A (Decisions & Scorecard)
- **Purpose**: Riskiest Assumption Test (RAT) tracking board mapped into Value, Usability, Feasibility, and Viability.
- **Key Sections**:
  - *Kanban Board*: Unvalidated → In Testing → Validated → Invalidated.
  - *Risk Matrix*: Impact vs. Uncertainty quadrant prioritization.
  - *Linked Experiments*: Direct drill-down to experiments designed to validate each assumption.
- **Contract Dependencies**: `Assumption`, `AssumptionStatus`, `RiskTier`.

### 9. Experiments Lab (`/experiments`)
- **Pod**: Pod A (Decisions & Scorecard)
- **Purpose**: Track lightweight smoke tests, landing page tests, pricing trials, and prototype pilots.
- **Key Sections**:
  - *Experiment Cards*: Hypothesis statement, metric target, sample size, deadline, cost.
  - *Results & Findings*: Statistical significance, raw observation log, pass/fail outcome.
  - *Priority Score*: Calculated using ICE (Impact, Confidence, Ease) scoring engine (`@fi/scoring`).
- **Contract Dependencies**: `Experiment`, `ExperimentPriorityScore`.

### 10. Decision Ledger (`/decisions`)
- **Pod**: Pod A (Decisions & Scorecard)
- **Purpose**: Immutable log of founder strategic decisions (Pivot, Persevere, Kill, Double Down) linked to evidence.
- **Key Sections**:
  - *Decision History*: Chronological ledger with author, rationale, date, and snapshot of scorecard at decision time.
  - *Recommendation Prompts*: Suggestions generated by AI based on assumption test outcomes.
  - *Outcome Tracking*: Retrospective reviews scheduled 30/60/90 days post-decision.
- **Contract Dependencies**: `Decision`, `Recommendation`.

### 11. Reports & Briefs (`/reports`)
- **Pod**: Pod B (Reports & Workspace)
- **Purpose**: Investor memos, board summaries, customer discovery decks, and PDF/Markdown export.
- **Key Sections**:
  - *Report Templates*: 1-Page Teaser, Deep Dive Investment Memo, Competitor Battlecard.
  - *Export Actions*: Copy Markdown, Download PDF, Public shareable link with access control.
  - *Generated Reports Archive*: Versioned history of past briefs generated across research runs.
- **Contract Dependencies**: `Report`, `ReportFormat`.

### 12. Radar & Monitoring (`/radar`)
- **Pod**: Pod C (Radar & Market Intelligence)
- **Purpose**: Ongoing automated surveillance of competitors, hiring signals, patent filings, and news alerts.
- **Key Sections**:
  - *Watch Items*: Monitored URLs, competitors, keywords, and scheduled cadence (daily/weekly).
  - *Alert Feed*: Chronological anomalies (e.g. competitor pricing change, key executive hire).
  - *Signal Impact Rating*: High, Medium, Low severity filters.
- **Contract Dependencies**: `WatchItem`, `Alert`.

### 13. Copilot (`/copilot`)
- **Pod**: Intelligence / Cross-Cutting
- **Purpose**: Grounded conversational assistant enabling founders to interrogate all research evidence for an idea.
- **Key Sections**:
  - *Chat Interface*: Context-aware queries ("Why did our moat score drop?", "What pricing evidence exists?").
  - *Citation Drawer*: Grounded references directly pointing to Evidence Vault items for every response.
  - *Action Shortcuts*: "Generate experiment from this insight", "Add to decision ledger".
- **Contract Dependencies**: `CopilotSession`, `GroundedMessage`.

---

## 4. Cross-Cutting Design Tokens & Error/Empty States

All modules adhere to the guidance established in `docs/design/ux-states.md`:
- **Loading**: Pulse skeletons (`<LoadingState />` or `<Skeleton />`) rather than blank screens or generic spinners.
- **Empty States**: Explanatory copy, graphic icon, and primary CTA directing user to the unlock action (`<EmptyIdeasState />`).
- **Error States**: Inline non-blocking banners (`<ErrorBanner />`) with actionable retry callbacks.
- **Color Tokens**: CSS custom properties defined in `packages/ui/src/tokens.css` (`--fi-bg`, `--fi-surface`, `--fi-border`, `--fi-accent`, `--fi-muted`, `--fi-danger`).
