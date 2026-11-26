import type { CustomerSegment, CustomerSegmentDetail } from "@fi/contracts";
import { withWorkspace } from "../../lib/db.js";
import { fetchLinkedClaims, toIsoString } from "../../lib/claims.js";

type CustomerSegmentRow = {
  id: string;
  workspace_id: string;
  idea_id: string;
  name: string;
  description: string | null;
  industry: string | null;
  company_size: string | null;
  buyer_persona: string | null;
  user_persona: string | null;
  jobs_to_be_done: CustomerSegment["jobsToBeDone"] | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function mapSegment(row: CustomerSegmentRow): CustomerSegment {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ideaId: row.idea_id,
    name: row.name,
    description: row.description,
    industry: row.industry,
    companySize: row.company_size,
    buyerPersona: row.buyer_persona,
    userPersona: row.user_persona,
    jobsToBeDone: Array.isArray(row.jobs_to_be_done) ? row.jobs_to_be_done : [],
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export const customersRepo = {
  list(workspaceId: string, ideaId: string): Promise<CustomerSegment[]> {
    return withWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query<CustomerSegmentRow>(
        `SELECT id, workspace_id, idea_id, name, description, industry, company_size,
                buyer_persona, user_persona, jobs_to_be_done, created_at, updated_at
         FROM customer_segments
         WHERE workspace_id = $1 AND idea_id = $2
         ORDER BY created_at DESC`,
        [workspaceId, ideaId],
      );
      return rows.map(mapSegment);
    });
  },

  getWithClaims(
    workspaceId: string,
    ideaId: string,
    segmentId: string,
  ): Promise<CustomerSegmentDetail | null> {
    return withWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query<CustomerSegmentRow>(
        `SELECT id, workspace_id, idea_id, name, description, industry, company_size,
                buyer_persona, user_persona, jobs_to_be_done, created_at, updated_at
         FROM customer_segments
         WHERE workspace_id = $1 AND idea_id = $2 AND id = $3`,
        [workspaceId, ideaId, segmentId],
      );
      if (!rows[0]) return null;
      const segment = mapSegment(rows[0]);
      const linkedClaims = await fetchLinkedClaims(c, {
        ideaId,
        module: "customer",
      });
      return { ...segment, linkedClaims };
    });
  },
};
