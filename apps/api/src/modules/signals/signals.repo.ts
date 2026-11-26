import type { Signal, SignalDetail } from "@fi/contracts";
import { withWorkspace } from "../../lib/db.js";
import {
  extractClaimIds,
  fetchLinkedClaims,
  toIsoString,
} from "../../lib/claims.js";
import type { ListSignalsQuery } from "./signals.schema.js";

type SignalRow = {
  id: string;
  workspace_id: string;
  idea_id: string;
  run_id: string | null;
  source_id: string | null;
  signal_type: Signal["signalType"];
  title: string;
  description: string;
  strength: Signal["strength"];
  observed_at: Date | string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
};

function mapSignal(row: SignalRow): Signal {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ideaId: row.idea_id,
    runId: row.run_id,
    sourceId: row.source_id,
    signalType: row.signal_type,
    title: row.title,
    description: row.description,
    strength: row.strength,
    observedAt: row.observed_at ? toIsoString(row.observed_at) : null,
    metadata: row.metadata ?? {},
    createdAt: toIsoString(row.created_at),
  };
}

export const signalsRepo = {
  list(
    workspaceId: string,
    ideaId: string,
    query: ListSignalsQuery = {},
  ): Promise<Signal[]> {
    return withWorkspace(workspaceId, async (c) => {
      const params: unknown[] = [workspaceId, ideaId];
      let sql =
        "SELECT id, workspace_id, idea_id, run_id, source_id, signal_type, title, description, strength, observed_at, metadata, created_at " +
        "FROM signals WHERE workspace_id = $1 AND idea_id = $2";
      if (query.signalType) {
        params.push(query.signalType);
        sql += ` AND signal_type = $${params.length}`;
      }
      if (query.strength) {
        params.push(query.strength);
        sql += ` AND strength = $${params.length}`;
      }
      sql += " ORDER BY created_at DESC";
      const { rows } = await c.query<SignalRow>(sql, params);
      return rows.map(mapSignal);
    });
  },

  getWithClaims(
    workspaceId: string,
    ideaId: string,
    signalId: string,
  ): Promise<SignalDetail | null> {
    return withWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query<SignalRow>(
        `SELECT id, workspace_id, idea_id, run_id, source_id, signal_type, title, description, strength, observed_at, metadata, created_at
         FROM signals
         WHERE workspace_id = $1 AND idea_id = $2 AND id = $3`,
        [workspaceId, ideaId, signalId],
      );
      if (!rows[0]) return null;
      const signal = mapSignal(rows[0]);
      const linkedClaims = await fetchLinkedClaims(c, {
        ideaId,
        module: "demand",
        claimIds: extractClaimIds(signal.metadata),
        sourceId: signal.sourceId,
      });
      return { ...signal, linkedClaims };
    });
  },
};
