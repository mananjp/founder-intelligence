import type { Competitor, CompetitorDetail } from "@fi/contracts";
import { withWorkspace } from "../../lib/db.js";
import {
  extractClaimIds,
  fetchLinkedClaims,
  toIsoString,
} from "../../lib/claims.js";
import type { ListCompetitorsQuery } from "./competitors.schema.js";

type CompetitorRow = {
  id: string;
  workspace_id: string;
  idea_id: string;
  name: string;
  website: string | null;
  kind: Competitor["kind"];
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function mapCompetitor(row: CompetitorRow): Competitor {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ideaId: row.idea_id,
    name: row.name,
    website: row.website,
    kind: row.kind,
    description: row.description,
    metadata: row.metadata ?? {},
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export const competitorsRepo = {
  list(
    workspaceId: string,
    ideaId: string,
    query: ListCompetitorsQuery = {},
  ): Promise<Competitor[]> {
    return withWorkspace(workspaceId, async (c) => {
      const params: unknown[] = [workspaceId, ideaId];
      let sql =
        "SELECT id, workspace_id, idea_id, name, website, kind, description, metadata, created_at, updated_at " +
        "FROM competitors WHERE workspace_id = $1 AND idea_id = $2";
      if (query.kind) {
        params.push(query.kind);
        sql += ` AND kind = $${params.length}`;
      }
      sql += " ORDER BY created_at DESC";
      const { rows } = await c.query<CompetitorRow>(sql, params);
      return rows.map(mapCompetitor);
    });
  },

  getWithClaims(
    workspaceId: string,
    ideaId: string,
    competitorId: string,
  ): Promise<CompetitorDetail | null> {
    return withWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query<CompetitorRow>(
        `SELECT id, workspace_id, idea_id, name, website, kind, description, metadata, created_at, updated_at
         FROM competitors
         WHERE workspace_id = $1 AND idea_id = $2 AND id = $3`,
        [workspaceId, ideaId, competitorId],
      );
      if (!rows[0]) return null;
      const competitor = mapCompetitor(rows[0]);
      const linkedClaims = await fetchLinkedClaims(c, {
        ideaId,
        module: "competitive",
        claimIds: extractClaimIds(competitor.metadata),
      });
      return { ...competitor, linkedClaims };
    });
  },
};
