import { withWorkspace } from "../../lib/db.js";
import type { ResearchRun, StartResearchRun } from "@fi/contracts";

export function mapRunRow(row: any): ResearchRun {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ideaId: row.idea_id,
    briefId: row.brief_id,
    depth: row.depth,
    geography: Array.isArray(row.geography) ? row.geography : [],
    state: row.state,
    budgetUsd: row.budget_usd != null ? Number(row.budget_usd) : null,
    spentUsd: row.spent_usd != null ? Number(row.spent_usd) : 0,
    lastCompletedStage: row.last_completed_stage ?? null,
    cancelRequestedAt: row.cancel_requested_at
      ? new Date(row.cancel_requested_at).toISOString()
      : null,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    completedAt: row.completed_at
      ? new Date(row.completed_at).toISOString()
      : null,
  };
}

export const researchRepo = {
  listRuns: (
    workspaceId: string,
    ideaId: string,
  ): Promise<ResearchRun[]> =>
    withWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query(
        `SELECT *
         FROM research_runs
         WHERE idea_id = $1 AND workspace_id = $2
         ORDER BY created_at DESC`,
        [ideaId, workspaceId],
      );
      return rows.map(mapRunRow);
    }),

  getRun: (
    workspaceId: string,
    ideaId: string,
    runId: string,
  ): Promise<ResearchRun | null> =>
    withWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query(
        `SELECT *
         FROM research_runs
         WHERE id = $1 AND idea_id = $2 AND workspace_id = $3
         LIMIT 1`,
        [runId, ideaId, workspaceId],
      );
      return rows[0] ? mapRunRow(rows[0]) : null;
    }),

  createRun: (
    workspaceId: string,
    ideaId: string,
    briefId: string,
    userId: string,
    data: StartResearchRun,
  ): Promise<ResearchRun> =>
    withWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query(
        `INSERT INTO research_runs (
           workspace_id, idea_id, brief_id, depth, geography, state, created_by
         )
         VALUES ($1, $2, $3, $4, $5, 'created', $6)
         RETURNING *`,
        [
          workspaceId,
          ideaId,
          briefId,
          data.depth,
          data.geography,
          userId,
        ],
      );
      return mapRunRow(rows[0]);
    }),

  cancelRun: (
    workspaceId: string,
    ideaId: string,
    runId: string,
  ): Promise<ResearchRun | null> =>
    withWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query(
        `UPDATE research_runs
         SET state = 'cancelled',
             completed_at = COALESCE(completed_at, NOW())
         WHERE id = $1 AND idea_id = $2 AND workspace_id = $3
         RETURNING *`,
        [runId, ideaId, workspaceId],
      );
      return rows[0] ? mapRunRow(rows[0]) : null;
    }),
};

