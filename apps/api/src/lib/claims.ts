import type { PoolClient } from "pg";
import type { Claim } from "@fi/contracts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ClaimRow = {
  id: string;
  idea_id: string;
  statement: string;
  module: Claim["module"];
  status: Claim["status"];
  evidence_ids: string[] | null;
};

/** Extracts valid UUID strings from `metadata.claimIds` or `metadata.claim_ids`. */
export function extractClaimIds(
  metadata: Record<string, unknown> | null | undefined,
): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const raw = metadata.claimIds ?? metadata.claim_ids;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (v): v is string => typeof v === "string" && UUID_RE.test(v),
  );
}

/**
 * Fetches claims linked to an intelligence entity (competitor, customer segment, or signal).
 * Prefers explicit `claimIds` or `sourceId` evidence links; falls back to the entity's
 * research `module` for the same idea when no explicit links are stored.
 */
export async function fetchLinkedClaims(
  client: PoolClient,
  opts: {
    ideaId: string;
    module: Claim["module"];
    claimIds?: string[];
    sourceId?: string | null;
  },
): Promise<Claim[]> {
  const claimIds = opts.claimIds ?? [];
  const hasExplicit = claimIds.length > 0 || Boolean(opts.sourceId);

  const sql = hasExplicit
    ? `SELECT c.id, c.idea_id, c.statement, c.module, c.status,
              COALESCE(array_agg(ce.evidence_id) FILTER (WHERE ce.evidence_id IS NOT NULL), '{}') AS evidence_ids
       FROM claims c
       LEFT JOIN claim_evidence ce ON ce.claim_id = c.id
       WHERE c.idea_id = $1
         AND (
           (cardinality($2::uuid[]) > 0 AND c.id = ANY($2::uuid[]))
           OR ($3::uuid IS NOT NULL AND EXISTS (
             SELECT 1 FROM claim_evidence ce2
             JOIN evidence e ON e.id = ce2.evidence_id
             WHERE ce2.claim_id = c.id AND e.source_id = $3::uuid
           ))
         )
       GROUP BY c.id
       ORDER BY c.created_at DESC`
    : `SELECT c.id, c.idea_id, c.statement, c.module, c.status,
              COALESCE(array_agg(ce.evidence_id) FILTER (WHERE ce.evidence_id IS NOT NULL), '{}') AS evidence_ids
       FROM claims c
       LEFT JOIN claim_evidence ce ON ce.claim_id = c.id
       WHERE c.idea_id = $1 AND c.module = $2
       GROUP BY c.id
       ORDER BY c.created_at DESC`;

  const params = hasExplicit
    ? [opts.ideaId, claimIds, opts.sourceId ?? null]
    : [opts.ideaId, opts.module];

  const { rows } = await client.query<ClaimRow>(sql, params);
  return rows.map((row) => ({
    id: row.id,
    ideaId: row.idea_id,
    statement: row.statement,
    module: row.module,
    status: row.status,
    evidenceIds: row.evidence_ids ?? [],
  }));
}

export function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
