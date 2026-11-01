import { withWorkspace } from "../../lib/db.js";
import type {
  InterviewTurnType,
  ResearchBriefType,
} from "./interview.schema.js";

export function mapTurnRow(row: any): InterviewTurnType {
  return {
    id: row.id,
    ideaId: row.idea_id,
    turnIndex: Number(row.turn_index),
    role: row.role,
    content: row.content,
    extracted:
      typeof row.extracted === "string"
        ? JSON.parse(row.extracted)
        : (row.extracted ?? null),
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString()
      : undefined,
  };
}

export function mapBriefRow(row: any): ResearchBriefType {
  return {
    id: row.id,
    ideaId: row.idea_id,
    version: Number(row.version),
    problem: row.problem,
    customer: row.customer,
    geography: row.geography ?? [],
    category: row.category,
    alternatives: row.alternatives,
    businessModel: row.business_model,
    differentiation: row.differentiation,
    knownEvidence:
      typeof row.known_evidence === "string"
        ? JSON.parse(row.known_evidence)
        : (row.known_evidence ?? []),
    unknowns:
      typeof row.unknowns === "string"
        ? JSON.parse(row.unknowns)
        : (row.unknowns ?? []),
    researchQuestions:
      typeof row.research_questions === "string"
        ? JSON.parse(row.research_questions)
        : (row.research_questions ?? []),
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString()
      : undefined,
  };
}

export const interviewRepo = {
  listTurns: (
    workspaceId: string,
    ideaId: string,
  ): Promise<InterviewTurnType[]> =>
    withWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query(
        `SELECT id, idea_id, turn_index, role, content, extracted, created_at
         FROM interview_turns
         WHERE idea_id = $1
         ORDER BY turn_index ASC`,
        [ideaId],
      );
      return rows.map(mapTurnRow);
    }),

  createTurn: (
    workspaceId: string,
    turn: {
      ideaId: string;
      turnIndex: number;
      role: "founder" | "assistant";
      content: string;
      extracted?: Record<string, unknown> | null;
    },
  ): Promise<InterviewTurnType> =>
    withWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query(
        `INSERT INTO interview_turns (idea_id, turn_index, role, content, extracted)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, idea_id, turn_index, role, content, extracted, created_at`,
        [
          turn.ideaId,
          turn.turnIndex,
          turn.role,
          turn.content,
          turn.extracted ? JSON.stringify(turn.extracted) : null,
        ],
      );
      return mapTurnRow(rows[0]);
    }),

  getLatestBrief: (
    workspaceId: string,
    ideaId: string,
  ): Promise<ResearchBriefType | null> =>
    withWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM research_briefs
         WHERE idea_id = $1
         ORDER BY version DESC
         LIMIT 1`,
        [ideaId],
      );
      return rows[0] ? mapBriefRow(rows[0]) : null;
    }),

  createBrief: (
    workspaceId: string,
    ideaId: string,
    data: {
      problem?: string | null;
      customer?: string | null;
      geography?: string[];
      category?: string | null;
      alternatives?: string | null;
      businessModel?: string | null;
      differentiation?: string | null;
      knownEvidence?: unknown[];
      unknowns?: unknown[];
      researchQuestions?: unknown[];
    },
  ): Promise<ResearchBriefType> =>
    withWorkspace(workspaceId, async (c) => {
      const vRes = await c.query(
        "SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM research_briefs WHERE idea_id = $1",
        [ideaId],
      );
      const nextVersion = Number(vRes.rows[0].next_version);

      const { rows } = await c.query(
        `INSERT INTO research_briefs (
           idea_id, version, problem, customer, geography, category,
           alternatives, business_model, differentiation,
           known_evidence, unknowns, research_questions
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          ideaId,
          nextVersion,
          data.problem ?? null,
          data.customer ?? null,
          data.geography ?? [],
          data.category ?? null,
          data.alternatives ?? null,
          data.businessModel ?? null,
          data.differentiation ?? null,
          JSON.stringify(data.knownEvidence ?? []),
          JSON.stringify(data.unknowns ?? []),
          JSON.stringify(data.researchQuestions ?? []),
        ],
      );
      return mapBriefRow(rows[0]);
    }),
};

