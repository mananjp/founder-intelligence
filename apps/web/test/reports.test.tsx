import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { QuickBriefReport } from "@fi/contracts";
import { QuickBriefDocument } from "../src/components/reports/QuickBriefDocument";

function buildReportFixture(
  overrides: Partial<QuickBriefReport["sections"]> = {},
): QuickBriefReport {
  const base: QuickBriefReport = {
    id: "00000000-0000-4000-8000-000000000099",
    ideaId: "00000000-0000-4000-8000-000000000003",
    runId: "00000000-0000-4000-8000-000000000005",
    kind: "quick_brief",
    version: 1,
    createdAt: "2026-10-10T12:00:00.000Z",
    sections: {
      metadata: {
        reportType: "quick_brief",
        ideaId: "00000000-0000-4000-8000-000000000003",
        ideaTitle: "Evidence-backed market intelligence for founders",
        ideaStage: "validating",
        ideaCategory: "b2b_saas",
        geography: ["AE", "IN"],
        workspaceId: "00000000-0000-4000-8000-000000000002",
        workspaceName: "Demo Workspace",
        runId: "00000000-0000-4000-8000-000000000005",
        runDepth: "standard",
        runState: "completed",
        runCreatedAt: "2026-10-10T11:00:00.000Z",
        runCompletedAt: "2026-10-10T11:08:00.000Z",
        briefId: "00000000-0000-4000-8000-000000000004",
        briefVersion: 1,
        generatedAt: "2026-10-10T12:00:00.000Z",
        dataCoverageSummary: {
          sourceCount: 1,
          evidenceCount: 1,
          claimCount: 1,
          competitorCount: 1,
          customerSegmentCount: 1,
          assumptionCount: 1,
          contradictionCount: 0,
        },
      },
      executiveVerdict: {
        verdictLabel: "Promising — Further Validation Needed",
        summary: "Evidence confirms research pain, while willingness to pay remains untested.",
        strengths: [
          {
            statement: "Market pain is confirmed by a primary founder source.",
            status: "verified",
            claimId: "00000000-0000-4000-8000-000000000031",
          },
        ],
        risks: [
          {
            statement: "Small venture teams will pay for continuous monitoring.",
            severity: "critical",
            status: "unverified",
            source: "assumption",
          },
        ],
        criticalUncertainties: ["Willingness to pay for continuous research support."],
        suggestedNextAction: {
          action: "Run 10 pricing validation interviews",
          rationale: "Directly addresses critical unverified WTP assumption.",
          confidence: 0.75,
          source: "recommendation",
        },
      },
      icp: {
        status: "established",
        summary: "ICP grounded in 1 customer segment.",
        primaryCustomer: "Early-stage founders",
        segments: [
          {
            id: "00000000-0000-4000-8000-000000000051",
            name: "Seed-stage Founders",
            description: "Founders validating B2B products in UAE and India.",
            industry: "B2B SaaS",
            companySize: "1-20",
            buyerPersona: "Founder / CEO",
            userPersona: "Founder / PM",
            jobsToBeDone: ["Validate willingness to pay before writing code"],
          },
        ],
        painPoints: ["Fragmented research notes"],
        jobsToBeDone: ["Validate willingness to pay before writing code"],
        buyingMotivations: ["Reduce wasted build cycles"],
        customerEvidence: [
          {
            id: "00000000-0000-4000-8000-000000000031",
            statement: "Founders spend hours synthesizing fragmented research.",
            status: "verified",
            quote: "I lose hours each week reconciling research notes.",
          },
        ],
        objectionsAndRisks: ["Preference for free spreadsheets"],
      },
      competitiveLandscape: {
        status: "populated",
        summary: "1 competitor profile recorded.",
        alternativesSummary: "Spreadsheets and generic AI chat",
        differentiationSummary: "Source-to-decision evidence lineage",
        competitors: [
          {
            id: "00000000-0000-4000-8000-000000000041",
            name: "Generic Research AI",
            kind: "indirect",
            website: "https://competitor.example.com",
            description: "General chat assistant",
            positioning: "Broad AI chat",
            product: "Chat Pro",
            capabilities: ["Web summary"],
            pricing: "$20/mo",
            differentiation: "No claim status lineage",
            strengths: ["Fast summaries"],
            limitations: ["Mixes fact and inference"],
            evidenceRefs: [],
          },
        ],
        competitiveClaims: [],
      },
      opportunityScore: {
        available: true,
        overallScore: 6.4,
        evidenceCoverage: 0.45,
        scoringModelVersion: "opportunity-score.v1",
        scoredAt: "2026-10-10T11:08:00.000Z",
        coverageAssessment: "moderate",
        uncertaintyNotice:
          "Evidence coverage is moderate (45%). The 6.4/10 score reflects partial corroboration alongside open assumptions and research gaps.",
        dimensions: [
          {
            key: "problem_severity",
            label: "Problem severity",
            score: 8,
            evidenceCoverage: 0.9,
            citedClaimIds: ["00000000-0000-4000-8000-000000000031"],
          },
        ],
      },
      appendix: {
        sources: [
          {
            id: "00000000-0000-4000-8000-000000000011",
            title: "Official founder survey summary",
            url: "https://demo.founder-intelligence.local/official",
            publisher: "Founder Intelligence",
            sourceType: "official_site",
            publishedAt: null,
            accessedAt: "2026-10-10T11:03:00.000Z",
          },
        ],
        evidenceSummaries: [
          {
            id: "00000000-0000-4000-8000-000000000021",
            claimText: "Founders lose hours reconciling research.",
            quote: "I lose hours each week reconciling research notes.",
            stance: "supports",
            kind: "fact",
            relevance: 0.95,
            sourceId: "00000000-0000-4000-8000-000000000011",
            sourceTitle: "Official founder survey summary",
            sourceUrl: "https://demo.founder-intelligence.local/official",
            observedAt: null,
          },
        ],
        claims: [
          {
            id: "00000000-0000-4000-8000-000000000031",
            module: "market",
            origin: "evidence",
            kind: "fact",
            statement: "Market pain is confirmed by a primary founder source.",
            status: "verified",
            evidenceCount: 1,
          },
        ],
        assumptions: [
          {
            id: "00000000-0000-4000-8000-000000000061",
            type: "wtp",
            statement: "Small venture teams will pay for continuous monitoring.",
            importance: "critical",
            status: "unverified",
          },
        ],
        contradictions: [],
        unknowns: ["Willingness to pay for continuous research support."],
        researchLimitations: ["Overall evidence coverage is 45% (moderate)."],
      },
    },
  };

  return {
    ...base,
    sections: {
      ...base.sections,
      ...overrides,
    },
  };
}

describe("QuickBriefDocument UI", () => {
  it("renders all required quick_brief sections and evidence badges", () => {
    const html = renderToStaticMarkup(
      <QuickBriefDocument report={buildReportFixture()} />,
    );

    expect(html).toContain("Evidence-backed market intelligence for founders");
    expect(html).toContain("1. Executive Verdict");
    expect(html).toContain("Promising — Further Validation Needed");
    expect(html).toContain("2. Ideal Customer Profile (ICP)");
    expect(html).toContain("Seed-stage Founders");
    expect(html).toContain("3. Competitive Landscape");
    expect(html).toContain("Generic Research AI");
    expect(html).toContain("4. Opportunity Score");
    expect(html).toContain("6.4");
    expect(html).toContain("45%");
    expect(html).toContain("5. Appendix");
    expect(html).toContain("Official founder survey summary");
    expect(html).toContain("verified");
  });

  it("renders honest unavailable states for missing score, empty competitors, and insufficient ICP", () => {
    const html = renderToStaticMarkup(
      <QuickBriefDocument
        report={buildReportFixture({
          icp: {
            status: "insufficient",
            summary:
              "Ideal Customer Profile was not sufficiently established in the latest research run.",
            primaryCustomer: null,
            segments: [],
            painPoints: [],
            jobsToBeDone: [],
            buyingMotivations: [],
            customerEvidence: [],
            objectionsAndRisks: [],
          },
          competitiveLandscape: {
            status: "empty",
            summary:
              "No competitor profiles or competitive claims were recorded in the latest research run.",
            alternativesSummary: null,
            differentiationSummary: null,
            competitors: [],
            competitiveClaims: [],
          },
          opportunityScore: {
            available: false,
            overallScore: null,
            evidenceCoverage: null,
            scoringModelVersion: null,
            scoredAt: null,
            coverageAssessment: "unavailable",
            uncertaintyNotice:
              "Opportunity score and evidence coverage are unavailable for this research run.",
            dimensions: [],
          },
        })}
      />,
    );

    expect(html).toContain(
      "Not sufficiently established in the latest research run.",
    );
    expect(html).toContain(
      "No competitor profiles or competitive claims were recorded in the latest research run.",
    );
    expect(html).toContain(
      "Opportunity score and evidence coverage are unavailable for this research run.",
    );
    expect(html).not.toContain("/ 10");
  });
});

