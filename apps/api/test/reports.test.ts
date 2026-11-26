import express from "express";
import request from "supertest";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickBriefReport } from "@fi/contracts";
import { buildApp } from "../src/app.js";
import { pool } from "../src/lib/db.js";
import { env } from "../src/config/env.js";
import { requireAuth } from "../src/middleware/auth.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { reportsRouter } from "../src/modules/reports/reports.routes.js";
import {
  buildQuickBriefSections,
  reportsService,
} from "../src/modules/reports/reports.service.js";
import {
  reportsRepo,
  type RunReportBundle,
} from "../src/modules/reports/reports.repo.js";
import {
  escapeHtml,
  renderQuickBriefHtml,
  renderQuickBriefPdf,
  sanitizeHttpUrl,
} from "../src/modules/reports/reports.pdf.js";
import * as pdfRenderer from "../src/modules/reports/reports.pdf.js";
import { ideasService } from "../src/modules/ideas/ideas.service.js";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const ideaId = "00000000-0000-4000-8000-000000000002";
const runId = "00000000-0000-4000-8000-000000000003";
const briefId = "00000000-0000-4000-8000-000000000004";
const reportId = "00000000-0000-4000-8000-000000000005";
const userId = "00000000-0000-4000-8000-000000000006";
const sourceId = "00000000-0000-4000-8000-000000000011";
const evidenceId = "00000000-0000-4000-8000-000000000021";
const claimId1 = "00000000-0000-4000-8000-000000000031";
const claimId2 = "00000000-0000-4000-8000-000000000032";
const competitorId = "00000000-0000-4000-8000-000000000041";
const segmentId = "00000000-0000-4000-8000-000000000051";
const assumptionId = "00000000-0000-4000-8000-000000000061";
const scoreId = "00000000-0000-4000-8000-000000000071";

const poolQuery = vi.spyOn(pool, "query");

async function createAuthToken(sub: string = userId) {
  const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
  return new SignJWT({ email: "founder@example.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secret);
}

function createApp() {
  const app = express();
  app.use(express.json());
  const v1 = express.Router();
  v1.use(requireAuth);
  v1.use("/workspaces/:workspaceId/ideas/:ideaId/reports", reportsRouter);
  app.use("/v1", v1);
  app.use(errorHandler);
  return app;
}

function createSampleBundle(
  overrides: Partial<RunReportBundle> = {},
): RunReportBundle {
  return {
    workspace: { id: workspaceId, name: "Founder Workspace" },
    idea: {
      id: ideaId,
      workspaceId,
      title: "AI Dispatch Copilot",
      rawDescription: "Dispatch automation for regional logistics fleets",
      category: "b2b_saas",
      geography: ["AE", "IN"],
      stage: "validating",
      status: "active",
      createdAt: "2026-10-01T10:00:00.000Z",
    },
    run: {
      id: runId,
      workspaceId,
      ideaId,
      briefId,
      depth: "standard",
      geography: ["AE", "IN"],
      state: "completed",
      budgetUsd: 4,
      spentUsd: 1.5,
      createdBy: userId,
      createdAt: "2026-10-10T10:00:00.000Z",
      completedAt: "2026-10-10T10:08:00.000Z",
    },
    brief: {
      id: briefId,
      version: 1,
      problem: "Dispatchers lose 8+ hours weekly reconciling WhatsApp updates.",
      customer: "Mid-market logistics fleets (20-100 trucks)",
      geography: ["AE", "IN"],
      category: "b2b_saas",
      alternatives: "Spreadsheets and manual phone calls",
      businessModel: "Per-fleet SaaS subscription",
      differentiation: "Evidence-backed exception routing",
      unknowns: ["Actual willingness to pay for automated dispatch"],
    },
    insights: [
      {
        id: "00000000-0000-4000-8000-000000000081",
        module: "market",
        summary: "Fleet operators experience recurring coordination delays.",
        citedClaimIds: [claimId1],
        createdAt: "2026-10-10T10:06:00.000Z",
      },
    ],
    recommendations: [
      {
        id: "00000000-0000-4000-8000-000000000091",
        action: "Run 10 structured pricing interviews with Dubai fleet managers.",
        rationale: "Pain is verified while willingness to pay remains untested.",
        citedClaimIds: [claimId1],
        linkedAssumptionIds: [assumptionId],
        confidence: 0.72,
        createdAt: "2026-10-10T10:07:00.000Z",
      },
    ],
    claims: [
      {
        id: claimId1,
        module: "customer",
        origin: "evidence",
        kind: "fact",
        statement: "Dispatchers reconcile route changes manually across apps.",
        status: "verified",
        evidenceCount: 1,
      },
      {
        id: claimId2,
        module: "competitive",
        origin: "evidence",
        kind: "fact",
        statement: "Legacy TMS suites require long multi-month onboarding.",
        status: "supported",
        evidenceCount: 1,
      },
    ],
    claimEvidenceIdsByClaim: {
      [claimId1]: [evidenceId],
    },
    evidence: [
      {
        id: evidenceId,
        sourceId,
        claimText: "Dispatchers reconcile route changes manually across apps.",
        quote: "Our team spends two hours every morning aligning driver messages.",
        stance: "supports",
        kind: "fact",
        relevance: 0.92,
        observedAt: "2026-10-05",
        sourceUrl: "https://example.com/fleet-survey",
        sourceTitle: "GCC Fleet Operations Study",
        sourcePublisher: "Logistics Review",
        sourceType: "industry_report",
        publishedAt: "2026-09-15",
        accessedAt: "2026-10-10T10:03:00.000Z",
      },
    ],
    contradictions: [],
    customerSegments: [
      {
        id: segmentId,
        name: "UAE Mid-Market Fleet Operators",
        description: "Regional 3PL operators running 20–100 vehicles.",
        industry: "Logistics & Transport",
        companySize: "50-250 employees",
        buyerPersona: "Head of Operations",
        userPersona: "Shift Dispatcher",
        jobsToBeDone: ["Eliminate empty return miles"],
      },
    ],
    competitors: [
      {
        id: competitorId,
        name: "RouteGrid",
        website: "https://routegrid.example.com",
        kind: "direct",
        description: "Legacy dispatch software for enterprise fleets.",
        metadata: {
          positioning: "Enterprise transport management suite",
          product: "RouteGrid Core",
          capabilities: ["Live GPS tracking", "Manifest export"],
          pricing: "$499/month starting tier",
          differentiation: "Deep ERP connectors",
          strengths: ["Established regional presence"],
          limitations: ["Heavy 8-week implementation"],
        },
      },
    ],
    opportunityScore: {
      id: scoreId,
      dimensionScores: {
        problem_severity: {
          score: 8.2,
          evidenceCoverage: 0.8,
          citedClaimIds: [claimId1],
        },
        competitive_pressure: {
          score: 6.0,
          evidenceCoverage: 0.4,
          citedClaimIds: [claimId2],
        },
      },
      overallScore: 7.1,
      evidenceCoverage: 0.35,
      scoringModelVersion: "opportunity-score.v1",
      createdAt: "2026-10-10T10:07:30.000Z",
    },
    assumptions: [
      {
        id: assumptionId,
        type: "wtp",
        statement: "Fleets will pay $300/month for automated exception routing.",
        importance: "critical",
        status: "unverified",
        linkedClaimIds: [],
      },
    ],
    ...overrides,
  };
}

describe("Reports Module — Quick Brief API & Playwright PDF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    poolQuery.mockImplementation(async (sql: any) => {
      const text = typeof sql === "string" ? sql : sql.text;
      if (text.includes("workspace_members")) {
        return { rows: [{ role: "member" }] } as any;
      }
      return { rows: [] } as any;
    });
    vi.spyOn(ideasService, "get").mockResolvedValue({
      id: ideaId,
      workspace_id: workspaceId,
      title: "AI Dispatch Copilot",
    } as any);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe("Unit: Report Assembly & Guardrails", () => {
    it("builds a complete validated quick_brief preserving weak-coverage uncertainty", () => {
      const sections = buildQuickBriefSections(
        createSampleBundle(),
        "2026-10-10T12:00:00.000Z",
      );

      expect(sections.metadata.reportType).toBe("quick_brief");
      expect(sections.metadata.ideaTitle).toBe("AI Dispatch Copilot");
      expect(sections.executiveVerdict.suggestedNextAction?.source).toBe(
        "recommendation",
      );
      expect(sections.icp.status).toBe("established");
      expect(sections.icp.segments).toHaveLength(1);
      expect(sections.competitiveLandscape.status).toBe("populated");
      expect(sections.competitiveLandscape.competitors[0].pricing).toBe(
        "$499/month starting tier",
      );
      expect(sections.opportunityScore.available).toBe(true);
      expect(sections.opportunityScore.overallScore).toBe(7.1);
      expect(sections.opportunityScore.evidenceCoverage).toBe(0.35);
      expect(sections.opportunityScore.coverageAssessment).toBe("weak");
      expect(sections.opportunityScore.uncertaintyNotice).toContain("weak");
      expect(sections.appendix.sources).toHaveLength(1);
    });

    it("handles missing score, empty competitors, and insufficient ICP without fabricating data", () => {
      const sections = buildQuickBriefSections(
        createSampleBundle({
          brief: null,
          insights: [],
          recommendations: [],
          claims: [],
          evidence: [],
          customerSegments: [],
          competitors: [],
          opportunityScore: null,
          assumptions: [],
        }),
      );

      expect(sections.opportunityScore.available).toBe(false);
      expect(sections.opportunityScore.overallScore).toBeNull();
      expect(sections.opportunityScore.evidenceCoverage).toBeNull();
      expect(sections.opportunityScore.coverageAssessment).toBe("unavailable");
      expect(sections.competitiveLandscape.status).toBe("empty");
      expect(sections.competitiveLandscape.competitors).toEqual([]);
      expect(sections.icp.status).toBe("insufficient");
      expect(sections.icp.primaryCustomer).toBeNull();
      expect(sections.executiveVerdict.suggestedNextAction).toBeNull();
      expect(sections.appendix.researchLimitations.length).toBeGreaterThan(0);
    });

    it("escapes HTML and blocks unsafe URL schemes in rendered report HTML", () => {
      expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
        "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
      );
      expect(sanitizeHttpUrl("javascript:alert(1)")).toBeNull();
      expect(sanitizeHttpUrl("file:///etc/passwd")).toBeNull();
      expect(sanitizeHttpUrl("https://example.com/a")).toBe(
        "https://example.com/a",
      );

      const bundle = createSampleBundle({
        idea: {
          ...createSampleBundle().idea,
          title: 'Idea <img src=x onerror="alert(1)">',
        },
        competitors: [
          {
            id: competitorId,
            name: "BadSite",
            website: "javascript:alert(1)",
            kind: "direct",
            description: "<script>evil()</script>",
            metadata: {},
          },
        ],
      });

      const sections = buildQuickBriefSections(bundle);
      const report = QuickBriefReport.parse({
        id: reportId,
        ideaId,
        runId,
        kind: "quick_brief",
        sections,
        version: 1,
        createdAt: "2026-10-10T12:00:00.000Z",
      });

      const html = renderQuickBriefHtml(report);
      expect(html).not.toContain("<script>evil()</script>");
      expect(html).not.toContain('href="javascript:alert(1)"');
      expect(html).toContain("&lt;script&gt;evil()&lt;/script&gt;");
    });

    it("renders empty, conflicting, and strong-coverage HTML variants cleanly", () => {
      const emptySections = buildQuickBriefSections(
        createSampleBundle({
          brief: null,
          insights: [],
          recommendations: [],
          claims: [],
          evidence: [],
          contradictions: [],
          customerSegments: [],
          competitors: [],
          opportunityScore: null,
          assumptions: [],
        }),
        "2026-10-10T12:00:00.000Z",
      );
      const emptyHtml = renderQuickBriefHtml(
        QuickBriefReport.parse({
          id: reportId,
          ideaId,
          runId,
          kind: "quick_brief",
          sections: emptySections,
          version: 1,
          createdAt: "2026-10-10T12:00:00.000Z",
        }),
      );
      expect(emptyHtml).toContain(
        "Ideal Customer Profile was not sufficiently established in the latest research run.",
      );
      expect(emptyHtml).toContain(
        "No competitor profiles or competitive claims were recorded in the latest research run.",
      );
      expect(emptyHtml).toContain(
        "Opportunity score and evidence coverage are unavailable for this research run.",
      );

      const strongSections = buildQuickBriefSections(
        createSampleBundle({
          claims: [
            {
              id: claimId1,
              module: "customer",
              origin: "evidence",
              kind: "fact",
              statement: "Verified strong buyer demand",
              status: "verified",
              evidenceCount: 2,
            },
            {
              id: claimId2,
              module: "risk",
              origin: "inference",
              kind: "assumption",
              statement: "Conflicting enterprise compliance timeline",
              status: "conflicting",
              evidenceCount: 1,
            },
            {
              id: "00000000-0000-4000-8000-000000000033",
              module: "market",
              origin: "evidence",
              kind: "metric",
              statement: "Directional growth in regional 3PL budgets",
              status: "directional",
              evidenceCount: 1,
            },
          ],
          contradictions: [
            {
              claimId: claimId1,
              claimStatement: "Claim A",
              contradictsClaimId: claimId2,
              contradictsStatement: "Claim B",
              note: "Regional variance across segments",
            },
          ],
          opportunityScore: {
            id: scoreId,
            dimensionScores: {
              market_pull: {
                score: 8.5,
                evidenceCoverage: 0.78,
                citedClaimIds: [claimId1],
              },
            },
            overallScore: 8.1,
            evidenceCoverage: 0.78,
            scoringModelVersion: "opportunity-score.v1",
            createdAt: "2026-10-10T10:07:30.000Z",
          },
        }),
      );
      expect(strongSections.opportunityScore.coverageAssessment).toBe("strong");
      const strongHtml = renderQuickBriefHtml(
        QuickBriefReport.parse({
          id: reportId,
          ideaId,
          runId,
          kind: "quick_brief",
          sections: strongSections,
          version: 3,
          createdAt: "2026-10-10T12:00:00.000Z",
        }),
      );
      expect(strongHtml).toContain("Verified strong buyer demand");
      expect(strongHtml).toContain("Regional variance across segments");
      expect(strongHtml).toContain("pill-danger");
    });

    it("loads and persists report bundles cleanly via reportsRepo with tenant scoping", async () => {
      const queries: string[] = [];
      const mockClient = {
        query: vi.fn(async (sql: string) => {
          queries.push(sql);
          if (
            sql.startsWith("BEGIN") ||
            sql.startsWith("COMMIT") ||
            sql.startsWith("ROLLBACK") ||
            sql.includes("set_config") ||
            sql.includes("pg_advisory_xact_lock")
          ) {
            return { rows: [] };
          }
          if (sql.includes("rr.state = 'completed'")) {
            return {
              rows: [
                {
                  id: runId,
                  workspace_id: workspaceId,
                  idea_id: ideaId,
                  brief_id: briefId,
                  depth: "standard",
                  geography: ["AE"],
                  state: "completed",
                  budget_usd: "4.0",
                  spent_usd: "1.2",
                  created_by: userId,
                  created_at: "2026-10-10T10:00:00.000Z",
                  completed_at: "2026-10-10T10:08:00.000Z",
                },
              ],
            };
          }
          if (sql.includes("FROM research_runs rr")) {
            return {
              rows: [
                {
                  id: runId,
                  state: "completed",
                  created_at: "2026-10-10T10:00:00.000Z",
                  completed_at: null,
                },
              ],
            };
          }
          if (sql.includes("FROM workspaces")) {
            return { rows: [{ id: workspaceId, name: "Founder Workspace" }] };
          }
          if (sql.includes("FROM ideas")) {
            return {
              rows: [
                {
                  id: ideaId,
                  workspace_id: workspaceId,
                  title: "AI Dispatch Copilot",
                  raw_description: "Dispatch automation",
                  category: "b2b_saas",
                  geography: ["AE"],
                  stage: "validating",
                  status: "active",
                  created_at: "2026-10-01T10:00:00.000Z",
                },
              ],
            };
          }
          if (sql.includes("FROM research_runs")) {
            return {
              rows: [
                {
                  id: runId,
                  workspace_id: workspaceId,
                  idea_id: ideaId,
                  brief_id: briefId,
                  depth: "standard",
                  geography: ["AE"],
                  state: "completed",
                  budget_usd: "4.0",
                  spent_usd: "1.2",
                  created_by: userId,
                  created_at: "2026-10-10T10:00:00.000Z",
                  completed_at: "2026-10-10T10:08:00.000Z",
                },
              ],
            };
          }
          if (sql.includes("FROM research_briefs")) {
            return {
              rows: [
                {
                  id: briefId,
                  version: 1,
                  problem: "Manual dispatch",
                  customer: "3PL fleets",
                  geography: ["AE"],
                  category: "b2b_saas",
                  alternatives: "Spreadsheets",
                  business_model: "SaaS",
                  differentiation: "AI exception routing",
                  unknowns: JSON.stringify(["WTP"]),
                },
              ],
            };
          }
          if (sql.includes("FROM insights")) {
            return {
              rows: [
                {
                  id: "00000000-0000-4000-8000-000000000081",
                  module: "market",
                  summary: "Fleet delays create overtime cost",
                  cited_claim_ids: [claimId1],
                  created_at: "2026-10-10T10:06:00.000Z",
                },
              ],
            };
          }
          if (sql.includes("FROM recommendations")) {
            return {
              rows: [
                {
                  id: "00000000-0000-4000-8000-000000000091",
                  action: "Run pricing interviews",
                  rationale: "Validate $300 tier",
                  cited_claim_ids: [claimId1],
                  linked_assumption_ids: [assumptionId],
                  confidence: "0.7",
                  created_at: "2026-10-10T10:07:00.000Z",
                },
              ],
            };
          }
          if (sql.includes("FROM claims c")) {
            return {
              rows: [
                {
                  id: claimId1,
                  module: "customer",
                  origin: "evidence",
                  kind: "fact",
                  statement: "Manual dispatch takes 2 hours",
                  status: "verified",
                  evidence_count: 1,
                },
              ],
            };
          }
          if (sql.includes("FROM claim_evidence")) {
            return { rows: [{ claim_id: claimId1, evidence_id: evidenceId }] };
          }
          if (sql.includes("FROM evidence e")) {
            return {
              rows: [
                {
                  id: evidenceId,
                  source_id: sourceId,
                  claim_text: "Manual dispatch",
                  quote: "Two hours a day",
                  stance: "supports",
                  kind: "fact",
                  relevance: "0.9",
                  observed_at: new Date("2026-10-05T00:00:00.000Z"),
                  source_url: "https://example.com/survey",
                  source_title: "Survey",
                  source_publisher: "Logistics Review",
                  source_type: "industry_report",
                  published_at: "2026-09-15",
                  accessed_at: "2026-10-10T10:03:00.000Z",
                },
              ],
            };
          }
          if (sql.includes("FROM claim_contradictions")) {
            return { rows: [] };
          }
          if (sql.includes("FROM customer_segments")) {
            return {
              rows: [
                {
                  id: segmentId,
                  name: "Mid-market Fleets",
                  description: "Regional 3PL",
                  industry: "Logistics",
                  company_size: "50-250",
                  buyer_persona: "Ops Lead",
                  user_persona: "Dispatcher",
                  jobs_to_be_done: [{ title: "Cut idle time" }, "Sync ETAs"],
                },
              ],
            };
          }
          if (sql.includes("FROM competitors")) {
            return {
              rows: [
                {
                  id: competitorId,
                  name: "RouteGrid",
                  website: "https://routegrid.example.com",
                  kind: "direct",
                  description: "Legacy TMS",
                  metadata: JSON.stringify({ pricing: "$499/mo" }),
                },
              ],
            };
          }
          if (sql.includes("FROM opportunity_scores")) {
            return {
              rows: [
                {
                  id: scoreId,
                  dimension_scores: "{}",
                  overall_score: "7.1",
                  evidence_coverage: "0.5",
                  scoring_model_version: "opportunity-score.v1",
                  created_at: "2026-10-10T10:07:30.000Z",
                },
              ],
            };
          }
          if (sql.includes("FROM assumptions")) {
            return {
              rows: [
                {
                  id: assumptionId,
                  type: "wtp",
                  statement: "WTP $300",
                  importance: "critical",
                  status: "unverified",
                  linked_claim_ids: [claimId1],
                },
              ],
            };
          }
          if (sql.includes("AS next_version")) {
            return { rows: [{ next_version: 2 }] };
          }
          if (
            sql.includes("INSERT INTO reports") ||
            sql.includes("FROM reports r")
          ) {
            return {
              rows: [
                {
                  id: reportId,
                  idea_id: ideaId,
                  run_id: runId,
                  kind: "quick_brief",
                  sections: JSON.stringify({ metadata: { reportType: "quick_brief" } }),
                  export_uri: null,
                  version: 2,
                  created_at: "2026-10-10T12:00:00.000Z",
                },
              ],
            };
          }
          return { rows: [] };
        }),
        release: vi.fn(),
      };
      const connectSpy = vi
        .spyOn(pool, "connect")
        .mockResolvedValue(mockClient as never);

      try {
        const lookup = await reportsRepo.findLatestRunLookup(workspaceId, ideaId);
        expect(lookup.latestCompletedRun?.id).toBe(runId);

        const bundle = await reportsRepo.loadRunReportBundle(
          workspaceId,
          ideaId,
          runId,
        );
        expect(bundle?.customerSegments[0].jobsToBeDone).toEqual([
          "Cut idle time",
          "Sync ETAs",
        ]);
        expect(bundle?.competitors[0].metadata).toEqual({ pricing: "$499/mo" });

        const latest = await reportsRepo.findLatestByRunAndKind(
          workspaceId,
          ideaId,
          runId,
          "quick_brief",
        );
        expect(latest?.version).toBe(2);

        const created = await reportsRepo.createReport(workspaceId, {
          ideaId,
          runId,
          kind: "quick_brief",
          sections: { ok: true },
        });
        expect(created.id).toBe(reportId);

        const list = await reportsRepo.listReports(workspaceId, ideaId);
        expect(list).toHaveLength(1);

        const single = await reportsRepo.getReport(workspaceId, ideaId, reportId);
        expect(single?.id).toBe(reportId);
        expect(queries.some((q) => q.includes("set_config"))).toBe(true);
      } finally {
        connectSpy.mockRestore();
      }
    });
  });

  describe("Integration: Playwright PDF Rendering", () => {
    it("generates a genuine non-empty PDF binary via Playwright", async () => {
      const sections = buildQuickBriefSections(
        createSampleBundle(),
        "2026-10-10T12:00:00.000Z",
      );
      const report = QuickBriefReport.parse({
        id: reportId,
        ideaId,
        runId,
        kind: "quick_brief",
        sections,
        version: 1,
        createdAt: "2026-10-10T12:00:00.000Z",
      });

      const pdfBuffer = await renderQuickBriefPdf(report);
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(pdfBuffer.length).toBeGreaterThan(5000);
    }, 30_000);
  });

  describe("HTTP API: Endpoints, AuthZ, and Latest Valid Run Selection", () => {
    const app = createApp();

    it("rejects unauthenticated requests with 401", async () => {
      await request(app)
        .post(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports`)
        .expect(401);
    });

    it("denies non-members with 403", async () => {
      poolQuery.mockResolvedValueOnce({ rows: [] } as never);
      const token = await createAuthToken();

      await request(app)
        .post(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports`)
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });

    it("denies viewer role on POST /reports while allowing GET /reports", async () => {
      poolQuery.mockResolvedValue({ rows: [{ role: "viewer" }] } as never);
      vi.spyOn(reportsRepo, "listReports").mockResolvedValue([]);
      const token = await createAuthToken();

      await request(app)
        .post(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports`)
        .set("Authorization", `Bearer ${token}`)
        .expect(403);

      await request(app)
        .get(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
    });

    it("returns 400 for malformed UUID parameters", async () => {
      const token = await createAuthToken();
      const res = await request(app)
        .get(`/v1/workspaces/${workspaceId}/ideas/not-a-uuid/reports`)
        .set("Authorization", `Bearer ${token}`)
        .expect(400);

      expect(res.body.error.code).toBe("invalid_idea");
    });

    it("returns 409 when idea has no research runs", async () => {
      const token = await createAuthToken();
      vi.spyOn(reportsRepo, "findLatestRunLookup").mockResolvedValue({
        latestCompletedRun: null,
        latestAnyRun: null,
      });

      const res = await request(app)
        .post(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports`)
        .set("Authorization", `Bearer ${token}`)
        .expect(409);

      expect(res.body.error.code).toBe("no_research_runs");
    });

    it("returns 409 when only failed or incomplete runs exist", async () => {
      const token = await createAuthToken();
      vi.spyOn(reportsRepo, "findLatestRunLookup").mockResolvedValue({
        latestCompletedRun: null,
        latestAnyRun: {
          id: runId,
          state: "failed",
          createdAt: "2026-10-10T10:00:00.000Z",
          completedAt: null,
        },
      });

      const res = await request(app)
        .post(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports`)
        .set("Authorization", `Bearer ${token}`)
        .expect(409);

      expect(res.body.error.code).toBe("no_valid_research_run");
      expect(res.body.error.details.latestRunState).toBe("failed");
    });

    it("selects the latest completed run even when a newer run failed and creates quick_brief (201)", async () => {
      const token = await createAuthToken();
      const bundle = createSampleBundle();
      vi.spyOn(reportsRepo, "findLatestRunLookup").mockResolvedValue({
        latestCompletedRun: bundle.run,
        latestAnyRun: {
          id: "00000000-0000-4000-8000-000000000999",
          state: "failed",
          createdAt: "2026-10-11T10:00:00.000Z",
          completedAt: null,
        },
      });
      vi.spyOn(reportsRepo, "findLatestByRunAndKind").mockResolvedValue(null);
      vi.spyOn(reportsRepo, "loadRunReportBundle").mockResolvedValue(bundle);
      const createSpy = vi
        .spyOn(reportsRepo, "createReport")
        .mockImplementation(async (_ws, data) => ({
          id: reportId,
          ideaId: data.ideaId,
          runId: data.runId,
          kind: data.kind,
          sections: data.sections,
          version: 1,
          createdAt: "2026-10-10T12:00:00.000Z",
        }));

      const res = await request(app)
        .post(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports`)
        .set("Authorization", `Bearer ${token}`)
        .send({ kind: "quick_brief" })
        .expect(201);

      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(res.body.data.id).toBe(reportId);
      expect(res.body.data.runId).toBe(runId);
      expect(res.body.data.kind).toBe("quick_brief");
      expect(QuickBriefReport.safeParse(res.body.data).success).toBe(true);
    });

    it("returns existing report idempotently (200) unless force=true", async () => {
      const token = await createAuthToken();
      const bundle = createSampleBundle();
      const existingReport = {
        id: reportId,
        ideaId,
        runId,
        kind: "quick_brief" as const,
        sections: buildQuickBriefSections(bundle, "2026-10-10T12:00:00.000Z"),
        version: 1,
        createdAt: "2026-10-10T12:00:00.000Z",
      };

      vi.spyOn(reportsRepo, "findLatestRunLookup").mockResolvedValue({
        latestCompletedRun: bundle.run,
        latestAnyRun: null,
      });
      vi.spyOn(reportsRepo, "findLatestByRunAndKind").mockResolvedValue(
        existingReport,
      );
      const createSpy = vi.spyOn(reportsRepo, "createReport");

      const res = await request(app)
        .post(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.id).toBe(reportId);
      expect(createSpy).not.toHaveBeenCalled();
    });

    it("returns 404 when report does not exist in workspace", async () => {
      const token = await createAuthToken();
      vi.spyOn(reportsRepo, "getReport").mockResolvedValue(null);

      const res = await request(app)
        .get(
          `/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports/${reportId}`,
        )
        .set("Authorization", `Bearer ${token}`)
        .expect(404);

      expect(res.body.error.code).toBe("report_not_found");
    });

    it("GET /reports/:reportId/pdf returns PDF attachment headers and binary payload", async () => {
      const token = await createAuthToken();
      const bundle = createSampleBundle();
      const savedReport = {
        id: reportId,
        ideaId,
        runId,
        kind: "quick_brief" as const,
        sections: buildQuickBriefSections(bundle, "2026-10-10T12:00:00.000Z"),
        version: 2,
        createdAt: "2026-10-10T12:00:00.000Z",
      };

      vi.spyOn(reportsRepo, "getReport").mockResolvedValue(savedReport);
      vi.spyOn(pdfRenderer, "renderQuickBriefPdf").mockResolvedValue(
        Buffer.from("%PDF-1.4\nmock\n%%EOF"),
      );

      const res = await request(app)
        .get(
          `/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports/${reportId}/pdf`,
        )
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.headers["content-type"]).toContain("application/pdf");
      expect(res.headers["content-disposition"]).toContain(
        "fi-quick-brief-ai-dispatch-copilot-v2.pdf",
      );
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(Buffer.from(res.body).subarray(0, 5).toString("ascii")).toBe(
        "%PDF-",
      );
    });

    it("rejects invalid POST body with 422", async () => {
      const token = await createAuthToken();
      await request(app)
        .post(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports`)
        .set("Authorization", `Bearer ${token}`)
        .send({ kind: "investor" })
        .expect(422);
    });

    it("returns a saved report via GET /reports/:reportId and rejects non-quick_brief PDF export with 422", async () => {
      const token = await createAuthToken();
      const bundle = createSampleBundle();
      const savedReport = {
        id: reportId,
        ideaId,
        runId,
        kind: "quick_brief" as const,
        sections: buildQuickBriefSections(bundle, "2026-10-10T12:00:00.000Z"),
        version: 1,
        createdAt: "2026-10-10T12:00:00.000Z",
      };

      const getSpy = vi.spyOn(reportsRepo, "getReport");
      getSpy.mockResolvedValueOnce(savedReport);

      const getRes = await request(app)
        .get(
          `/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports/${reportId}`,
        )
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(getRes.body.data.id).toBe(reportId);

      getSpy.mockResolvedValueOnce({
        ...savedReport,
        kind: "investor" as never,
      });

      const pdfErr = await request(app)
        .get(
          `/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports/${reportId}/pdf`,
        )
        .set("Authorization", `Bearer ${token}`)
        .expect(422);
      expect(pdfErr.body.error.code).toBe("unsupported_report_kind");
    });

    it("creates a new report version when force=true even if one exists for the latest completed run", async () => {
      const token = await createAuthToken();
      const bundle = createSampleBundle();
      vi.spyOn(reportsRepo, "findLatestRunLookup").mockResolvedValue({
        latestCompletedRun: bundle.run,
        latestAnyRun: null,
      });
      const findExistingSpy = vi.spyOn(reportsRepo, "findLatestByRunAndKind");
      vi.spyOn(reportsRepo, "loadRunReportBundle").mockResolvedValue(bundle);
      vi.spyOn(reportsRepo, "createReport").mockImplementation(
        async (_ws, data) => ({
          id: reportId,
          ideaId: data.ideaId,
          runId: data.runId,
          kind: data.kind,
          sections: data.sections,
          version: 2,
          createdAt: "2026-10-10T13:00:00.000Z",
        }),
      );

      const res = await request(app)
        .post(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports`)
        .set("Authorization", `Bearer ${token}`)
        .send({ kind: "quick_brief", force: true })
        .expect(201);

      expect(findExistingSpy).not.toHaveBeenCalled();
      expect(res.body.data.version).toBe(2);
    });

    it("rejects unauthenticated requests across all report endpoints", async () => {
      await request(app)
        .get(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports`)
        .expect(401);
      await request(app)
        .get(
          `/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports/${reportId}`,
        )
        .expect(401);
      await request(app)
        .get(
          `/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports/${reportId}/pdf`,
        )
        .expect(401);
    });

    it("rejects malformed workspaceId and reportId parameters with 400 before querying database", async () => {
      const token = await createAuthToken();
      const wsRes = await request(app)
        .get(`/v1/workspaces/not-a-uuid/ideas/${ideaId}/reports`)
        .set("Authorization", `Bearer ${token}`)
        .expect(400);
      expect(wsRes.body.error.code).toBe("invalid_workspace");

      const reportRes = await request(app)
        .get(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports/bad-id`)
        .set("Authorization", `Bearer ${token}`)
        .expect(400);
      expect(reportRes.body.error.code).toBe("invalid_report");
    });

    it("allows viewer role to read single report and export PDF while blocking report generation", async () => {
      poolQuery.mockResolvedValue({ rows: [{ role: "viewer" }] } as never);
      const bundle = createSampleBundle();
      const savedReport = {
        id: reportId,
        ideaId,
        runId,
        kind: "quick_brief" as const,
        sections: buildQuickBriefSections(bundle, "2026-10-10T12:00:00.000Z"),
        version: 1,
        createdAt: "2026-10-10T12:00:00.000Z",
      };
      vi.spyOn(reportsRepo, "getReport").mockResolvedValue(savedReport);
      vi.spyOn(pdfRenderer, "renderQuickBriefPdf").mockResolvedValue(
        Buffer.from("%PDF-1.4\nviewer\n%%EOF"),
      );
      const token = await createAuthToken();

      await request(app)
        .get(
          `/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports/${reportId}`,
        )
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      await request(app)
        .get(
          `/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports/${reportId}/pdf`,
        )
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      await request(app)
        .post(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports`)
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });

    it("blocks cross-idea PDF export with 404 when reportId belongs to a different idea", async () => {
      const token = await createAuthToken();
      vi.spyOn(reportsRepo, "getReport").mockResolvedValue(null);

      await request(app)
        .get(
          `/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports/00000000-0000-4000-8000-000000000999/pdf`,
        )
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });

    it("exposes Content-Disposition over CORS for WEB_ORIGIN and does not allow arbitrary origins", async () => {
      const fullApp = buildApp();
      const token = await createAuthToken();
      const bundle = createSampleBundle();
      const savedReport = {
        id: reportId,
        ideaId,
        runId,
        kind: "quick_brief" as const,
        sections: buildQuickBriefSections(bundle, "2026-10-10T12:00:00.000Z"),
        version: 2,
        createdAt: "2026-10-10T12:00:00.000Z",
      };

      vi.spyOn(reportsRepo, "getReport").mockResolvedValue(savedReport);
      vi.spyOn(pdfRenderer, "renderQuickBriefPdf").mockResolvedValue(
        Buffer.from("%PDF-1.4\ncors\n%%EOF"),
      );

      const allowedPreflight = await request(fullApp)
        .options(
          `/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports/${reportId}/pdf`,
        )
        .set("Origin", env.WEB_ORIGIN)
        .set("Access-Control-Request-Method", "GET")
        .set("Access-Control-Request-Headers", "authorization")
        .expect(204);

      expect(allowedPreflight.headers["access-control-allow-origin"]).toBe(
        env.WEB_ORIGIN,
      );
      expect(
        allowedPreflight.headers["access-control-allow-credentials"],
      ).toBe("true");

      const allowedRes = await request(fullApp)
        .get(
          `/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports/${reportId}/pdf`,
        )
        .set("Origin", env.WEB_ORIGIN)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(allowedRes.headers["access-control-allow-origin"]).toBe(
        env.WEB_ORIGIN,
      );
      expect(
        String(allowedRes.headers["access-control-expose-headers"] ?? "").toLowerCase(),
      ).toContain("content-disposition");
      expect(allowedRes.headers["content-disposition"]).toContain(
        "fi-quick-brief-ai-dispatch-copilot-v2.pdf",
      );

      const blockedRes = await request(fullApp)
        .get(
          `/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports/${reportId}/pdf`,
        )
        .set("Origin", "https://evil.example")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(blockedRes.headers["access-control-allow-origin"]).toBe(
        env.WEB_ORIGIN,
      );
      expect(blockedRes.headers["access-control-allow-origin"]).not.toBe(
        "https://evil.example",
      );
      expect(blockedRes.headers["access-control-allow-origin"]).not.toBe("*");
    });
  });
});
