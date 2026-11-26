import {
  DimensionKey,
  QuickBriefReport,
  QuickBriefSections,
  type CreateReportBody,
  type QuickBriefCompetitor,
  type QuickBriefScoreDimension,
  type Report,
} from "@fi/contracts";
import { HttpError } from "../../middleware/errorHandler.js";
import { ideasService } from "../ideas/ideas.service.js";
import {
  reportsRepo,
  type ReportAssumptionRow,
  type ReportClaimRow,
  type ReportCompetitorRow,
  type ReportContradictionRow,
  type ReportEvidenceRow,
  type RunReportBundle,
} from "./reports.repo.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  problem_severity: "Problem severity",
  market_attractiveness: "Market attractiveness",
  customer_willingness: "Customer willingness",
  competitive_pressure: "Competitive pressure",
  differentiation: "Differentiation",
  timing: "Timing",
  monetization: "Monetization",
  distribution_feasibility: "Distribution feasibility",
  defensibility: "Defensibility",
  execution_fit: "Execution fit",
};

function assertUuid(value: string, code: string, message: string): void {
  if (!UUID_REGEX.test(value)) {
    throw new HttpError(400, code, message);
  }
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function extractUnknownStrings(rawUnknowns: unknown[]): string[] {
  const items: string[] = [];
  for (const entry of rawUnknowns) {
    if (typeof entry === "string") {
      items.push(entry);
    } else if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const text =
        record.question ?? record.statement ?? record.title ?? record.text;
      if (typeof text === "string") {
        items.push(text);
      }
    }
  }
  return dedupeStrings(items);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return dedupeStrings(
    value.map((item) => (typeof item === "string" ? item : null)),
  );
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function mapCompetitor(row: ReportCompetitorRow): QuickBriefCompetitor {
  const meta = row.metadata ?? {};
  const pricingRaw = meta.pricing;
  const pricing =
    typeof pricingRaw === "string"
      ? pricingRaw.trim() || null
      : pricingRaw && typeof pricingRaw === "object"
        ? JSON.stringify(pricingRaw)
        : null;

  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    website: row.website,
    description: row.description,
    positioning: asOptionalString(meta.positioning),
    product: asOptionalString(meta.product),
    capabilities: asStringArray(meta.capabilities ?? meta.features),
    pricing,
    differentiation: asOptionalString(meta.differentiation),
    strengths: asStringArray(meta.strengths),
    limitations: asStringArray(meta.limitations ?? meta.weaknesses),
    evidenceRefs: asStringArray(
      meta.evidenceRefs ?? meta.evidenceIds ?? meta.sourceIds,
    ),
  };
}

function buildOpportunityScoreSection(
  bundle: RunReportBundle,
): QuickBriefSections["opportunityScore"] {
  const row = bundle.opportunityScore;
  if (
    !row ||
    !Number.isFinite(row.overallScore) ||
    !Number.isFinite(row.evidenceCoverage) ||
    row.overallScore < 0 ||
    row.overallScore > 10 ||
    row.evidenceCoverage < 0 ||
    row.evidenceCoverage > 1
  ) {
    return {
      available: false,
      overallScore: null,
      evidenceCoverage: null,
      scoringModelVersion: null,
      scoredAt: null,
      coverageAssessment: "unavailable",
      uncertaintyNotice:
        "Opportunity score and evidence coverage are unavailable for this research run.",
      dimensions: [],
    };
  }

  const dimensions: QuickBriefScoreDimension[] = [];
  for (const key of DimensionKey.options) {
    const rawDim = row.dimensionScores[key];
    if (!rawDim || typeof rawDim !== "object") continue;
    const record = rawDim as Record<string, unknown>;
    const score = Number(record.score);
    const coverage = Number(
      record.evidenceCoverage ?? record.evidence_coverage,
    );
    if (
      !Number.isFinite(score) ||
      score < 0 ||
      score > 10 ||
      !Number.isFinite(coverage) ||
      coverage < 0 ||
      coverage > 1
    ) {
      continue;
    }
    const rawClaims = record.citedClaimIds ?? record.citations;
    const citedClaimIds = Array.isArray(rawClaims)
      ? rawClaims.filter(
          (id): id is string => typeof id === "string" && UUID_REGEX.test(id),
        )
      : [];
    dimensions.push({
      key,
      label: DIMENSION_LABELS[key],
      score,
      evidenceCoverage: coverage,
      citedClaimIds,
    });
  }

  const pct = Math.round(row.evidenceCoverage * 100);
  const coverageAssessment =
    row.evidenceCoverage >= 0.7
      ? "strong"
      : row.evidenceCoverage >= 0.45
        ? "moderate"
        : "weak";

  const uncertaintyNotice =
    coverageAssessment === "weak"
      ? `Evidence coverage is weak (${pct}%). Treat the ${row.overallScore.toFixed(1)}/10 opportunity score as low-certainty until missing evidence and assumptions are validated.`
      : coverageAssessment === "moderate"
        ? `Evidence coverage is moderate (${pct}%). The ${row.overallScore.toFixed(1)}/10 score reflects partial corroboration alongside open assumptions and research gaps.`
        : `Evidence coverage is strong (${pct}%), though conflicting claims and untested assumptions should still be verified before major commitments.`;

  return {
    available: true,
    overallScore: row.overallScore,
    evidenceCoverage: row.evidenceCoverage,
    scoringModelVersion: row.scoringModelVersion,
    scoredAt: row.createdAt,
    coverageAssessment,
    uncertaintyNotice,
    dimensions,
  };
}

function buildIcpSection(bundle: RunReportBundle): QuickBriefSections["icp"] {
  const customerClaims = bundle.claims.filter((c) => c.module === "customer");
  const evidenceById = new Map<string, ReportEvidenceRow>(
    bundle.evidence.map((e) => [e.id, e]),
  );

  const primarySegment = bundle.customerSegments[0];
  const primaryCustomer =
    primarySegment?.name ??
    primarySegment?.buyerPersona ??
    bundle.brief?.customer ??
    null;

  const jobsToBeDone = dedupeStrings(
    bundle.customerSegments.flatMap((seg) => seg.jobsToBeDone),
  );

  const painPoints = dedupeStrings([
    bundle.brief?.problem ?? null,
    ...customerClaims
      .filter((c) => c.status === "verified" || c.status === "supported")
      .map((c) => c.statement),
  ]);

  const buyingMotivations = dedupeStrings(
    bundle.claims
      .filter(
        (c) =>
          (c.module === "pricing" || c.module === "customer") &&
          (c.status === "verified" ||
            c.status === "supported" ||
            c.status === "directional"),
      )
      .map((c) => c.statement),
  );

  const customerEvidence = customerClaims.map((claim) => {
    const linkedIds = bundle.claimEvidenceIdsByClaim[claim.id] ?? [];
    const firstEvidence = linkedIds
      .map((id) => evidenceById.get(id))
      .find((ev): ev is ReportEvidenceRow => Boolean(ev));
    return {
      id: claim.id,
      statement: claim.statement,
      status: claim.status,
      quote: firstEvidence?.quote ?? null,
    };
  });

  const objectionsAndRisks = dedupeStrings([
    ...customerClaims
      .filter((c) => c.status === "conflicting")
      .map((c) => c.statement),
    ...bundle.evidence
      .filter((e) => e.stance === "contradicts")
      .map((e) => e.claimText),
    ...bundle.assumptions
      .filter(
        (a) =>
          (a.type === "customer" || a.type === "wtp") &&
          (a.status === "unverified" ||
            a.status === "weakened" ||
            a.status === "rejected" ||
            a.status === "testing"),
      )
      .map((a) => `[${a.importance}/${a.status}] ${a.statement}`),
  ]);

  const hasStructuredSegments = bundle.customerSegments.length > 0;
  const hasCustomerContext =
    Boolean(primaryCustomer) || customerEvidence.length > 0;

  const status: QuickBriefSections["icp"]["status"] =
    hasStructuredSegments && customerEvidence.length > 0
      ? "established"
      : hasCustomerContext
        ? "partial"
        : "insufficient";

  const summary =
    status === "established"
      ? `ICP is grounded in ${bundle.customerSegments.length} customer segment profile(s) and ${customerEvidence.length} customer claim(s) from the latest run.`
      : status === "partial"
        ? `ICP is partially established from ${hasStructuredSegments ? `${bundle.customerSegments.length} customer segment(s)` : "the research brief"}${customerEvidence.length > 0 ? ` and ${customerEvidence.length} customer claim(s)` : ""}, but structured segment validation remains incomplete.`
        : "Ideal Customer Profile was not sufficiently established in the latest research run.";

  return {
    status,
    summary,
    primaryCustomer,
    segments: bundle.customerSegments.map((seg) => ({
      id: seg.id,
      name: seg.name,
      description: seg.description,
      industry: seg.industry,
      companySize: seg.companySize,
      buyerPersona: seg.buyerPersona,
      userPersona: seg.userPersona,
      jobsToBeDone: seg.jobsToBeDone,
    })),
    painPoints,
    jobsToBeDone,
    buyingMotivations,
    customerEvidence,
    objectionsAndRisks,
  };
}

function buildCompetitiveSection(
  bundle: RunReportBundle,
): QuickBriefSections["competitiveLandscape"] {
  const competitors = bundle.competitors.map(mapCompetitor);
  const competitiveClaims = bundle.claims
    .filter((c) => c.module === "competitive")
    .map((c) => ({
      id: c.id,
      statement: c.statement,
      status: c.status,
    }));

  const alternativesSummary = bundle.brief?.alternatives ?? null;
  const differentiationSummary = bundle.brief?.differentiation ?? null;

  const status: QuickBriefSections["competitiveLandscape"]["status"] =
    competitors.length > 0
      ? "populated"
      : competitiveClaims.length > 0 || Boolean(alternativesSummary)
        ? "claims_only"
        : "empty";

  const summary =
    status === "populated"
      ? `${competitors.length} competitor profile(s) were recorded for this idea alongside ${competitiveClaims.length} competitive claim(s).`
      : status === "claims_only"
        ? "No structured competitor profiles were recorded for this research run; available context comes from competitive claims or interview alternatives."
        : "No competitor profiles or competitive claims were recorded in the latest research run.";

  return {
    status,
    summary,
    alternativesSummary,
    differentiationSummary,
    competitors,
    competitiveClaims,
  };
}

function buildExecutiveVerdictSection(
  bundle: RunReportBundle,
  opportunityScore: QuickBriefSections["opportunityScore"],
  contradictions: ReportContradictionRow[],
  unknowns: string[],
): QuickBriefSections["executiveVerdict"] {
  const conflictingClaims = bundle.claims.filter(
    (c) => c.status === "conflicting",
  );
  const strongClaims = bundle.claims.filter(
    (c) => c.status === "verified" || c.status === "supported",
  );
  const weakOrUnprovenClaims = bundle.claims.filter(
    (c) => c.status === "assumption" || c.status === "unverified",
  );

  let verdictLabel: string;
  if (
    opportunityScore.available &&
    opportunityScore.overallScore !== null &&
    opportunityScore.evidenceCoverage !== null
  ) {
    if (
      opportunityScore.overallScore >= 7.0 &&
      opportunityScore.evidenceCoverage >= 0.6 &&
      contradictions.length === 0 &&
      conflictingClaims.length === 0
    ) {
      verdictLabel = "Favorable — Evidence-Backed";
    } else if (
      (contradictions.length > 0 || conflictingClaims.length > 0) &&
      opportunityScore.overallScore < 6.5
    ) {
      verdictLabel = "Mixed — Contested Signals";
    } else if (opportunityScore.overallScore >= 6.0) {
      verdictLabel = "Promising — Further Validation Needed";
    } else {
      verdictLabel = "Cautious — Early Signals";
    }
  } else if (bundle.claims.length > 0 || bundle.insights.length > 0) {
    verdictLabel = "Provisional — Score Unavailable";
  } else {
    verdictLabel = "Insufficient Research Evidence";
  }

  const insightLead = bundle.insights.map((i) => i.summary).join(" ");
  const scoreSnippet =
    opportunityScore.available &&
    opportunityScore.overallScore !== null &&
    opportunityScore.evidenceCoverage !== null
      ? `Opportunity score is ${opportunityScore.overallScore.toFixed(1)}/10 with ${Math.round(opportunityScore.evidenceCoverage * 100)}% evidence coverage across ${bundle.evidence.length} evidence item(s) and ${bundle.claims.length} claim(s).`
      : `Based on ${bundle.evidence.length} evidence item(s) and ${bundle.claims.length} claim(s) from the latest completed run (no opportunity score recorded).`;

  const summary = insightLead
    ? `${insightLead} ${scoreSnippet}`
    : scoreSnippet;

  const strengths: QuickBriefSections["executiveVerdict"]["strengths"] =
    strongClaims.map((c) => ({
      statement: c.statement,
      status: c.status,
      claimId: c.id,
    }));

  if (strengths.length === 0 && bundle.insights.length > 0) {
    for (const insight of bundle.insights) {
      strengths.push({ statement: insight.summary });
    }
  }

  const risks: QuickBriefSections["executiveVerdict"]["risks"] = [];
  for (const c of conflictingClaims) {
    risks.push({
      statement: c.statement,
      status: c.status,
      source: "claim",
    });
  }
  for (const cc of contradictions) {
    risks.push({
      statement: cc.note
        ? `Contradiction: ${cc.note}`
        : `Conflicting claims: "${cc.claimStatement}" vs "${cc.contradictsStatement}"`,
      status: "conflicting",
      source: "contradiction",
    });
  }
  for (const a of bundle.assumptions) {
    if (
      (a.importance === "critical" || a.importance === "high") &&
      a.status !== "supported" &&
      a.status !== "accepted"
    ) {
      risks.push({
        statement: a.statement,
        severity: a.importance,
        status: a.status,
        source: "assumption",
      });
    }
  }
  for (const dim of opportunityScore.dimensions) {
    if (dim.score <= 4.5) {
      risks.push({
        statement: `Low score in ${dim.label} (${dim.score.toFixed(1)}/10, ${Math.round(dim.evidenceCoverage * 100)}% coverage).`,
        status: "low_dimension",
        source: "scorecard",
      });
    }
  }

  const criticalUncertainties = dedupeStrings([
    ...unknowns,
    ...weakOrUnprovenClaims.map((c) => `[${c.status}] ${c.statement}`),
    ...bundle.assumptions
      .filter((a) => a.status === "unverified" || a.status === "testing")
      .map((a) => `[${a.importance} ${a.type} assumption] ${a.statement}`),
  ]);

  let suggestedNextAction: QuickBriefSections["executiveVerdict"]["suggestedNextAction"] =
    null;
  const topRecommendation = bundle.recommendations[0];
  if (topRecommendation) {
    suggestedNextAction = {
      action: topRecommendation.action,
      rationale: topRecommendation.rationale,
      confidence: topRecommendation.confidence,
      source: "recommendation",
    };
  } else {
    const priorityAssumption: ReportAssumptionRow | undefined =
      bundle.assumptions.find(
        (a) =>
          (a.importance === "critical" || a.importance === "high") &&
          a.status !== "supported" &&
          a.status !== "accepted",
      ) ?? bundle.assumptions[0];

    if (priorityAssumption) {
      suggestedNextAction = {
        action: `Validate ${priorityAssumption.importance} ${priorityAssumption.type} assumption: ${priorityAssumption.statement}`,
        rationale:
          "No explicit AI recommendation row was stored for this run; prioritized from the highest-risk unvalidated assumption.",
        confidence: null,
        source: "derived_from_gaps",
      };
    } else if (weakOrUnprovenClaims[0]) {
      const claim: ReportClaimRow = weakOrUnprovenClaims[0];
      suggestedNextAction = {
        action: `Gather primary evidence for ${claim.status} claim: ${claim.statement}`,
        rationale:
          "Derived from the top unproven claim in the latest completed run.",
        confidence: null,
        source: "derived_from_gaps",
      };
    }
  }

  return {
    verdictLabel,
    summary,
    strengths,
    risks,
    criticalUncertainties,
    suggestedNextAction,
  };
}

function buildAppendixSection(
  bundle: RunReportBundle,
  opportunityScore: QuickBriefSections["opportunityScore"],
  icp: QuickBriefSections["icp"],
  competitiveLandscape: QuickBriefSections["competitiveLandscape"],
  unknowns: string[],
): QuickBriefSections["appendix"] {
  const sourceMap = new Map<
    string,
    QuickBriefSections["appendix"]["sources"][number]
  >();
  for (const ev of bundle.evidence) {
    if (!sourceMap.has(ev.sourceId)) {
      sourceMap.set(ev.sourceId, {
        id: ev.sourceId,
        title: ev.sourceTitle,
        url: ev.sourceUrl,
        publisher: ev.sourcePublisher,
        sourceType: ev.sourceType,
        publishedAt: ev.publishedAt,
        accessedAt: ev.accessedAt,
      });
    }
  }

  const researchLimitations: string[] = [];
  if (bundle.evidence.length === 0) {
    researchLimitations.push(
      "No supporting or contradicting evidence items were linked to this run.",
    );
  }
  if (!opportunityScore.available) {
    researchLimitations.push(
      "Opportunity score and evidence coverage were not recorded for this run.",
    );
  } else if (opportunityScore.coverageAssessment !== "strong") {
    researchLimitations.push(
      `Overall evidence coverage is ${Math.round((opportunityScore.evidenceCoverage ?? 0) * 100)}% (${opportunityScore.coverageAssessment}).`,
    );
  }
  if (bundle.customerSegments.length === 0) {
    researchLimitations.push(
      "No structured customer segment profiles were recorded in customer_segments.",
    );
  }
  if (competitiveLandscape.competitors.length === 0) {
    researchLimitations.push(
      "No structured competitor profiles were recorded in competitors.",
    );
  }
  const unprovenCount = bundle.claims.filter(
    (c) => c.status === "assumption" || c.status === "unverified",
  ).length;
  if (unprovenCount > 0) {
    researchLimitations.push(
      `${unprovenCount} of ${bundle.claims.length} claim(s) remain classified as assumption or unverified.`,
    );
  }
  if (bundle.contradictions.length > 0) {
    researchLimitations.push(
      `${bundle.contradictions.length} contradiction link(s) exist between claims.`,
    );
  }
  if (icp.status === "insufficient") {
    researchLimitations.push(
      "Customer/ICP profile data is insufficient in the latest run.",
    );
  }

  return {
    sources: [...sourceMap.values()],
    evidenceSummaries: bundle.evidence.map((ev) => ({
      id: ev.id,
      claimText: ev.claimText,
      quote: ev.quote,
      stance: ev.stance,
      kind: ev.kind,
      relevance: ev.relevance,
      sourceId: ev.sourceId,
      sourceTitle: ev.sourceTitle,
      sourceUrl: ev.sourceUrl,
      observedAt: ev.observedAt,
    })),
    claims: bundle.claims.map((c) => ({
      id: c.id,
      module: c.module,
      origin: c.origin,
      kind: c.kind,
      statement: c.statement,
      status: c.status,
      evidenceCount: c.evidenceCount,
    })),
    assumptions: bundle.assumptions.map((a) => ({
      id: a.id,
      type: a.type,
      statement: a.statement,
      importance: a.importance,
      status: a.status,
    })),
    contradictions: bundle.contradictions.map((cc) => ({
      claimId: cc.claimId,
      claimStatement: cc.claimStatement,
      contradictsClaimId: cc.contradictsClaimId,
      contradictsStatement: cc.contradictsStatement,
      note: cc.note,
    })),
    unknowns,
    researchLimitations,
  };
}

export function buildQuickBriefSections(
  bundle: RunReportBundle,
  generatedAt: string = new Date().toISOString(),
): QuickBriefSections {
  const unknowns = extractUnknownStrings(bundle.brief?.unknowns ?? []);
  const opportunityScore = buildOpportunityScoreSection(bundle);
  const icp = buildIcpSection(bundle);
  const competitiveLandscape = buildCompetitiveSection(bundle);
  const executiveVerdict = buildExecutiveVerdictSection(
    bundle,
    opportunityScore,
    bundle.contradictions,
    unknowns,
  );
  const appendix = buildAppendixSection(
    bundle,
    opportunityScore,
    icp,
    competitiveLandscape,
    unknowns,
  );

  const sections: QuickBriefSections = {
    metadata: {
      reportType: "quick_brief",
      ideaId: bundle.idea.id,
      ideaTitle: bundle.idea.title,
      ideaStage: bundle.idea.stage,
      ideaCategory: bundle.idea.category,
      geography:
        bundle.run.geography.length > 0
          ? bundle.run.geography
          : bundle.idea.geography,
      workspaceId: bundle.workspace.id,
      workspaceName: bundle.workspace.name,
      runId: bundle.run.id,
      runDepth: bundle.run.depth,
      runState: bundle.run.state,
      runCreatedAt: bundle.run.createdAt,
      runCompletedAt: bundle.run.completedAt ?? null,
      briefId: bundle.brief?.id ?? null,
      briefVersion: bundle.brief?.version ?? null,
      generatedAt,
      dataCoverageSummary: {
        sourceCount: appendix.sources.length,
        evidenceCount: appendix.evidenceSummaries.length,
        claimCount: appendix.claims.length,
        competitorCount: competitiveLandscape.competitors.length,
        customerSegmentCount: icp.segments.length,
        assumptionCount: appendix.assumptions.length,
        contradictionCount: appendix.contradictions.length,
      },
    },
    executiveVerdict,
    icp,
    competitiveLandscape,
    opportunityScore,
    appendix,
  };

  return QuickBriefSections.parse(sections);
}

export interface GenerateReportResult {
  report: Report;
  created: boolean;
}

export const reportsService = {
  async list(workspaceId: string, ideaId: string): Promise<Report[]> {
    assertUuid(workspaceId, "invalid_workspace", "Malformed workspace id");
    assertUuid(ideaId, "invalid_idea", "Malformed idea id");
    await ideasService.get(workspaceId, ideaId);
    return reportsRepo.listReports(workspaceId, ideaId);
  },

  async get(
    workspaceId: string,
    ideaId: string,
    reportId: string,
  ): Promise<Report> {
    assertUuid(workspaceId, "invalid_workspace", "Malformed workspace id");
    assertUuid(ideaId, "invalid_idea", "Malformed idea id");
    assertUuid(reportId, "invalid_report", "Malformed report id");
    await ideasService.get(workspaceId, ideaId);
    const report = await reportsRepo.getReport(workspaceId, ideaId, reportId);
    if (!report) {
      throw new HttpError(404, "report_not_found", "Report not found");
    }
    return report;
  },

  async getQuickBriefForPdf(
    workspaceId: string,
    ideaId: string,
    reportId: string,
  ): Promise<QuickBriefReport> {
    const report = await this.get(workspaceId, ideaId, reportId);
    if (report.kind !== "quick_brief") {
      throw new HttpError(
        422,
        "unsupported_report_kind",
        "PDF export is only supported for quick_brief reports",
      );
    }
    const parsed = QuickBriefReport.safeParse(report);
    if (!parsed.success) {
      throw new HttpError(
        422,
        "invalid_report_structure",
        "Stored report sections cannot be rendered to PDF",
      );
    }
    return parsed.data;
  },

  async generateQuickBrief(
    workspaceId: string,
    ideaId: string,
    body?: Partial<CreateReportBody>,
  ): Promise<GenerateReportResult> {
    assertUuid(workspaceId, "invalid_workspace", "Malformed workspace id");
    assertUuid(ideaId, "invalid_idea", "Malformed idea id");
    await ideasService.get(workspaceId, ideaId);

    const force = Boolean(body?.force);
    const lookup = await reportsRepo.findLatestRunLookup(workspaceId, ideaId);

    if (!lookup.latestCompletedRun) {
      if (!lookup.latestAnyRun) {
        throw new HttpError(
          409,
          "no_research_runs",
          "No research runs exist for this idea yet. Run research before generating a quick brief.",
        );
      }
      throw new HttpError(
        409,
        "no_valid_research_run",
        `No completed research run is available yet. Latest run is currently '${lookup.latestAnyRun.state}'.`,
        {
          latestRunId: lookup.latestAnyRun.id,
          latestRunState: lookup.latestAnyRun.state,
        },
      );
    }

    const latestValidRun = lookup.latestCompletedRun;

    if (!force) {
      const existing = await reportsRepo.findLatestByRunAndKind(
        workspaceId,
        ideaId,
        latestValidRun.id,
        "quick_brief",
      );
      if (existing) {
        const validExisting = QuickBriefReport.safeParse(existing);
        if (validExisting.success) {
          return { report: existing, created: false };
        }
      }
    }

    const bundle = await reportsRepo.loadRunReportBundle(
      workspaceId,
      ideaId,
      latestValidRun.id,
    );
    if (!bundle) {
      throw new HttpError(
        404,
        "research_bundle_not_found",
        "Could not load research run data for report generation",
      );
    }

    const sections = buildQuickBriefSections(bundle);
    const report = await reportsRepo.createReport(workspaceId, {
      ideaId,
      runId: latestValidRun.id,
      kind: "quick_brief",
      sections,
    });

    return { report, created: true };
  },
};
