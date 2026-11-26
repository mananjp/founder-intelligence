import { withWorkspace } from "../../lib/db.js";
import type { ClaimStatus, Report, ReportKind } from "@fi/contracts";
import { mapRunRow } from "../research/research.repo.js";
import type { ResearchRun } from "@fi/contracts";

export interface ReportIdeaRow {
  id: string;
  workspaceId: string;
  title: string;
  rawDescription: string;
  category: string | null;
  geography: string[];
  stage: string;
  status: string;
  createdAt: string;
}

export interface ReportBriefRow {
  id: string;
  version: number;
  problem: string | null;
  customer: string | null;
  geography: string[];
  category: string | null;
  alternatives: string | null;
  businessModel: string | null;
  differentiation: string | null;
  unknowns: unknown[];
}

export interface ReportInsightRow {
  id: string;
  module: string;
  summary: string;
  citedClaimIds: string[];
  createdAt: string;
}

export interface ReportRecommendationRow {
  id: string;
  action: string;
  rationale: string;
  citedClaimIds: string[];
  linkedAssumptionIds: string[];
  confidence: number | null;
  createdAt: string;
}

export interface ReportClaimRow {
  id: string;
  module: string;
  origin: string;
  kind: string;
  statement: string;
  status: ClaimStatus;
  evidenceCount: number;
}

export interface ReportEvidenceRow {
  id: string;
  sourceId: string;
  claimText: string;
  quote: string;
  stance: string;
  kind: string;
  relevance: number;
  observedAt: string | null;
  sourceUrl: string;
  sourceTitle: string | null;
  sourcePublisher: string | null;
  sourceType: string;
  publishedAt: string | null;
  accessedAt: string;
}

export interface ReportContradictionRow {
  claimId: string;
  claimStatement: string;
  contradictsClaimId: string;
  contradictsStatement: string;
  note: string | null;
}

export interface ReportCustomerSegmentRow {
  id: string;
  name: string;
  description: string | null;
  industry: string | null;
  companySize: string | null;
  buyerPersona: string | null;
  userPersona: string | null;
  jobsToBeDone: string[];
}

export interface ReportCompetitorRow {
  id: string;
  name: string;
  website: string | null;
  kind: string;
  description: string | null;
  metadata: Record<string, unknown>;
}

export interface ReportOpportunityScoreRow {
  id: string;
  dimensionScores: Record<string, unknown>;
  overallScore: number;
  evidenceCoverage: number;
  scoringModelVersion: string;
  createdAt: string;
}

export interface ReportAssumptionRow {
  id: string;
  type: string;
  statement: string;
  importance: string;
  status: string;
  linkedClaimIds: string[];
}

export interface RunReportBundle {
  workspace: { id: string; name: string };
  idea: ReportIdeaRow;
  run: ResearchRun;
  brief: ReportBriefRow | null;
  insights: ReportInsightRow[];
  recommendations: ReportRecommendationRow[];
  claims: ReportClaimRow[];
  claimEvidenceIdsByClaim: Record<string, string[]>;
  evidence: ReportEvidenceRow[];
  contradictions: ReportContradictionRow[];
  customerSegments: ReportCustomerSegmentRow[];
  competitors: ReportCompetitorRow[];
  opportunityScore: ReportOpportunityScoreRow | null;
  assumptions: ReportAssumptionRow[];
}

export interface LatestRunLookup {
  latestCompletedRun: ResearchRun | null;
  latestAnyRun: {
    id: string;
    state: string;
    createdAt: string;
    completedAt: string | null;
  } | null;
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function toIsoDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const str = String(value);
  return str.length >= 10 ? str.slice(0, 10) : str;
}

function toStringArray(value: unknown): string[] {
  const parsed = parseJsonValue<unknown>(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const candidate =
          record.title ?? record.job ?? record.statement ?? record.text;
        return typeof candidate === "string" ? candidate.trim() : "";
      }
      return "";
    })
    .filter((s) => s.length > 0);
}

export function mapReportRow(row: any): Report {
  const sections = parseJsonValue<Record<string, unknown>>(row.sections, {});
  return {
    id: row.id,
    ideaId: row.idea_id,
    runId: row.run_id ?? undefined,
    kind: row.kind as ReportKind,
    sections,
    exportUri: row.export_uri ?? undefined,
    version: Number(row.version),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export const reportsRepo = {
  findLatestRunLookup: (
    workspaceId: string,
    ideaId: string,
  ): Promise<LatestRunLookup> =>
    withWorkspace(workspaceId, async (c) => {
      const completedRes = await c.query(
        `SELECT rr.*
         FROM research_runs rr
         JOIN ideas i ON i.id = rr.idea_id
         WHERE rr.workspace_id = $1
           AND rr.idea_id = $2
           AND i.workspace_id = $1
           AND rr.state = 'completed'
         ORDER BY rr.completed_at DESC NULLS LAST, rr.created_at DESC
         LIMIT 1`,
        [workspaceId, ideaId],
      );

      const latestAnyRes = await c.query(
        `SELECT rr.id, rr.state, rr.created_at, rr.completed_at
         FROM research_runs rr
         JOIN ideas i ON i.id = rr.idea_id
         WHERE rr.workspace_id = $1
           AND rr.idea_id = $2
           AND i.workspace_id = $1
         ORDER BY rr.created_at DESC
         LIMIT 1`,
        [workspaceId, ideaId],
      );

      return {
        latestCompletedRun: completedRes.rows[0]
          ? mapRunRow(completedRes.rows[0])
          : null,
        latestAnyRun: latestAnyRes.rows[0]
          ? {
              id: latestAnyRes.rows[0].id,
              state: latestAnyRes.rows[0].state,
              createdAt: new Date(latestAnyRes.rows[0].created_at).toISOString(),
              completedAt: latestAnyRes.rows[0].completed_at
                ? new Date(latestAnyRes.rows[0].completed_at).toISOString()
                : null,
            }
          : null,
      };
    }),

  loadRunReportBundle: (
    workspaceId: string,
    ideaId: string,
    runId: string,
  ): Promise<RunReportBundle | null> =>
    withWorkspace(workspaceId, async (c) => {
      const wsRes = await c.query(
        `SELECT id, name FROM workspaces WHERE id = $1 LIMIT 1`,
        [workspaceId],
      );
      const ideaRes = await c.query(
        `SELECT id, workspace_id, title, raw_description, category, geography, stage, status, created_at
         FROM ideas
         WHERE id = $1 AND workspace_id = $2
         LIMIT 1`,
        [ideaId, workspaceId],
      );
      const runRes = await c.query(
        `SELECT *
         FROM research_runs
         WHERE id = $1 AND idea_id = $2 AND workspace_id = $3
         LIMIT 1`,
        [runId, ideaId, workspaceId],
      );

      if (!wsRes.rows[0] || !ideaRes.rows[0] || !runRes.rows[0]) {
        return null;
      }

      const run = mapRunRow(runRes.rows[0]);

      const [
        briefRes,
        insightsRes,
        recommendationsRes,
        claimsRes,
        claimEvidenceRes,
        evidenceRes,
        contradictionsRes,
        segmentsRes,
        competitorsRes,
        scoreRes,
        assumptionsRes,
      ] = await Promise.all([
        c.query(
          `SELECT id, version, problem, customer, geography, category, alternatives,
                  business_model, differentiation, unknowns
           FROM research_briefs
           WHERE id = $1 AND idea_id = $2
           LIMIT 1`,
          [run.briefId, ideaId],
        ),
        c.query(
          `SELECT id, module, summary, cited_claim_ids, created_at
           FROM insights
           WHERE idea_id = $1 AND run_id = $2
           ORDER BY created_at ASC, id ASC`,
          [ideaId, runId],
        ),
        c.query(
          `SELECT id, action, rationale, cited_claim_ids, linked_assumption_ids, confidence, created_at
           FROM recommendations
           WHERE idea_id = $1 AND run_id = $2
           ORDER BY created_at DESC, id ASC`,
          [ideaId, runId],
        ),
        c.query(
          `SELECT c.id, c.module, c.origin, c.kind, c.statement, c.status,
                  COUNT(ce.evidence_id)::int AS evidence_count
           FROM claims c
           LEFT JOIN claim_evidence ce ON ce.claim_id = c.id
           WHERE c.idea_id = $1 AND c.run_id = $2
           GROUP BY c.id
           ORDER BY c.created_at ASC, c.id ASC`,
          [ideaId, runId],
        ),
        c.query(
          `SELECT ce.claim_id, ce.evidence_id
           FROM claim_evidence ce
           JOIN claims c ON c.id = ce.claim_id
           JOIN evidence e ON e.id = ce.evidence_id
           WHERE c.idea_id = $1 AND c.run_id = $2 AND e.run_id = $2`,
          [ideaId, runId],
        ),
        c.query(
          `SELECT e.id, e.source_id, e.claim_text, e.quote, e.stance, e.kind, e.relevance, e.observed_at,
                  s.url AS source_url, s.title AS source_title, s.publisher AS source_publisher,
                  s.source_type, s.published_at, s.accessed_at
           FROM evidence e
           JOIN sources s ON s.id = e.source_id
           JOIN research_runs rr ON rr.id = e.run_id
           WHERE e.run_id = $1 AND rr.idea_id = $2 AND rr.workspace_id = $3
           ORDER BY e.relevance DESC, e.created_at ASC, e.id ASC`,
          [runId, ideaId, workspaceId],
        ),
        c.query(
          `SELECT cc.claim_id, c1.statement AS claim_statement,
                  cc.contradicts_claim_id, c2.statement AS contradicts_statement,
                  cc.note
           FROM claim_contradictions cc
           JOIN claims c1 ON c1.id = cc.claim_id
           JOIN claims c2 ON c2.id = cc.contradicts_claim_id
           WHERE c1.idea_id = $1 AND c1.run_id = $2 AND c2.idea_id = $1`,
          [ideaId, runId],
        ),
        c.query(
          `SELECT id, name, description, industry, company_size, buyer_persona, user_persona, jobs_to_be_done
           FROM customer_segments
           WHERE workspace_id = $1 AND idea_id = $2
           ORDER BY created_at ASC, id ASC`,
          [workspaceId, ideaId],
        ),
        c.query(
          `SELECT id, name, website, kind, description, metadata
           FROM competitors
           WHERE workspace_id = $1 AND idea_id = $2
           ORDER BY created_at ASC, id ASC`,
          [workspaceId, ideaId],
        ),
        c.query(
          `SELECT id, dimension_scores, overall_score, evidence_coverage, scoring_model_version, created_at
           FROM opportunity_scores
           WHERE idea_id = $1 AND run_id = $2
           ORDER BY created_at DESC
           LIMIT 1`,
          [ideaId, runId],
        ),
        c.query(
          `SELECT a.id, a.type, a.statement, a.importance, a.status, a.linked_claim_ids
           FROM assumptions a
           JOIN ideas i ON i.id = a.idea_id
           WHERE a.idea_id = $1 AND i.workspace_id = $2
           ORDER BY
             CASE a.importance
               WHEN 'critical' THEN 0
               WHEN 'high' THEN 1
               WHEN 'medium' THEN 2
               ELSE 3
             END,
             a.created_at ASC,
             a.id ASC`,
          [ideaId, workspaceId],
        ),
      ]);

      const claimEvidenceIdsByClaim: Record<string, string[]> = {};
      for (const row of claimEvidenceRes.rows) {
        const list = (claimEvidenceIdsByClaim[row.claim_id] ??= []);
        list.push(row.evidence_id);
      }

      const ideaRow = ideaRes.rows[0];
      const briefRow = briefRes.rows[0];
      const scoreRow = scoreRes.rows[0];

      return {
        workspace: {
          id: wsRes.rows[0].id,
          name: wsRes.rows[0].name,
        },
        idea: {
          id: ideaRow.id,
          workspaceId: ideaRow.workspace_id,
          title: ideaRow.title,
          rawDescription: ideaRow.raw_description,
          category: ideaRow.category ?? null,
          geography: Array.isArray(ideaRow.geography) ? ideaRow.geography : [],
          stage: ideaRow.stage,
          status: ideaRow.status,
          createdAt: new Date(ideaRow.created_at).toISOString(),
        },
        run,
        brief: briefRow
          ? {
              id: briefRow.id,
              version: Number(briefRow.version),
              problem: briefRow.problem ?? null,
              customer: briefRow.customer ?? null,
              geography: Array.isArray(briefRow.geography)
                ? briefRow.geography
                : [],
              category: briefRow.category ?? null,
              alternatives: briefRow.alternatives ?? null,
              businessModel: briefRow.business_model ?? null,
              differentiation: briefRow.differentiation ?? null,
              unknowns: parseJsonValue<unknown[]>(briefRow.unknowns, []),
            }
          : null,
        insights: insightsRes.rows.map((r) => ({
          id: r.id,
          module: r.module,
          summary: r.summary,
          citedClaimIds: Array.isArray(r.cited_claim_ids)
            ? r.cited_claim_ids
            : [],
          createdAt: new Date(r.created_at).toISOString(),
        })),
        recommendations: recommendationsRes.rows.map((r) => ({
          id: r.id,
          action: r.action,
          rationale: r.rationale,
          citedClaimIds: Array.isArray(r.cited_claim_ids)
            ? r.cited_claim_ids
            : [],
          linkedAssumptionIds: Array.isArray(r.linked_assumption_ids)
            ? r.linked_assumption_ids
            : [],
          confidence: r.confidence != null ? Number(r.confidence) : null,
          createdAt: new Date(r.created_at).toISOString(),
        })),
        claims: claimsRes.rows.map((r) => ({
          id: r.id,
          module: r.module,
          origin: r.origin,
          kind: r.kind,
          statement: r.statement,
          status: r.status as ClaimStatus,
          evidenceCount: Number(r.evidence_count ?? 0),
        })),
        claimEvidenceIdsByClaim,
        evidence: evidenceRes.rows.map((r) => ({
          id: r.id,
          sourceId: r.source_id,
          claimText: r.claim_text,
          quote: r.quote,
          stance: r.stance,
          kind: r.kind,
          relevance: Number(r.relevance),
          observedAt: toIsoDate(r.observed_at),
          sourceUrl: r.source_url,
          sourceTitle: r.source_title ?? null,
          sourcePublisher: r.source_publisher ?? null,
          sourceType: r.source_type,
          publishedAt: toIsoDate(r.published_at),
          accessedAt: new Date(r.accessed_at).toISOString(),
        })),
        contradictions: contradictionsRes.rows.map((r) => ({
          claimId: r.claim_id,
          claimStatement: r.claim_statement,
          contradictsClaimId: r.contradicts_claim_id,
          contradictsStatement: r.contradicts_statement,
          note: r.note ?? null,
        })),
        customerSegments: segmentsRes.rows.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description ?? null,
          industry: r.industry ?? null,
          companySize: r.company_size ?? null,
          buyerPersona: r.buyer_persona ?? null,
          userPersona: r.user_persona ?? null,
          jobsToBeDone: toStringArray(r.jobs_to_be_done),
        })),
        competitors: competitorsRes.rows.map((r) => ({
          id: r.id,
          name: r.name,
          website: r.website ?? null,
          kind: r.kind,
          description: r.description ?? null,
          metadata: parseJsonValue<Record<string, unknown>>(r.metadata, {}),
        })),
        opportunityScore: scoreRow
          ? {
              id: scoreRow.id,
              dimensionScores: parseJsonValue<Record<string, unknown>>(
                scoreRow.dimension_scores,
                {},
              ),
              overallScore: Number(scoreRow.overall_score),
              evidenceCoverage: Number(scoreRow.evidence_coverage),
              scoringModelVersion: scoreRow.scoring_model_version,
              createdAt: new Date(scoreRow.created_at).toISOString(),
            }
          : null,
        assumptions: assumptionsRes.rows.map((r) => ({
          id: r.id,
          type: r.type,
          statement: r.statement,
          importance: r.importance,
          status: r.status,
          linkedClaimIds: Array.isArray(r.linked_claim_ids)
            ? r.linked_claim_ids
            : [],
        })),
      };
    }),

  findLatestByRunAndKind: (
    workspaceId: string,
    ideaId: string,
    runId: string,
    kind: ReportKind,
  ): Promise<Report | null> =>
    withWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query(
        `SELECT r.*
         FROM reports r
         JOIN ideas i ON i.id = r.idea_id
         WHERE i.workspace_id = $1
           AND r.idea_id = $2
           AND r.run_id = $3
           AND r.kind = $4
         ORDER BY r.version DESC, r.created_at DESC
         LIMIT 1`,
        [workspaceId, ideaId, runId, kind],
      );
      return rows[0] ? mapReportRow(rows[0]) : null;
    }),

  createReport: (
    workspaceId: string,
    data: {
      ideaId: string;
      runId: string;
      kind: ReportKind;
      sections: Record<string, unknown>;
    },
  ): Promise<Report> =>
    withWorkspace(workspaceId, async (c) => {
      await c.query(
        `SELECT pg_advisory_xact_lock(hashtext($1))`,
        [`${data.ideaId}:${data.kind}`],
      );
      const vRes = await c.query(
        `SELECT COALESCE(MAX(r.version), 0) + 1 AS next_version
         FROM reports r
         JOIN ideas i ON i.id = r.idea_id
         WHERE i.workspace_id = $1 AND r.idea_id = $2 AND r.kind = $3`,
        [workspaceId, data.ideaId, data.kind],
      );
      const nextVersion = Number(vRes.rows[0]?.next_version ?? 1);

      const { rows } = await c.query(
        `INSERT INTO reports (idea_id, run_id, kind, sections, version)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         RETURNING *`,
        [
          data.ideaId,
          data.runId,
          data.kind,
          JSON.stringify(data.sections),
          nextVersion,
        ],
      );
      return mapReportRow(rows[0]);
    }),

  listReports: (workspaceId: string, ideaId: string): Promise<Report[]> =>
    withWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query(
        `SELECT r.*
         FROM reports r
         JOIN ideas i ON i.id = r.idea_id
         WHERE i.workspace_id = $1 AND r.idea_id = $2
         ORDER BY r.created_at DESC, r.version DESC`,
        [workspaceId, ideaId],
      );
      return rows.map(mapReportRow);
    }),

  getReport: (
    workspaceId: string,
    ideaId: string,
    reportId: string,
  ): Promise<Report | null> =>
    withWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query(
        `SELECT r.*
         FROM reports r
         JOIN ideas i ON i.id = r.idea_id
         WHERE r.id = $1 AND r.idea_id = $2 AND i.workspace_id = $3
         LIMIT 1`,
        [reportId, ideaId, workspaceId],
      );
      return rows[0] ? mapReportRow(rows[0]) : null;
    }),
};

