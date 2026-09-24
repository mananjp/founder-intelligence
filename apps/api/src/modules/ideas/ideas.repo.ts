import { withWorkspace } from "../../lib/db.js";
import type { CreateIdeaBody } from "./ideas.schema.js";

export const ideasRepo = {
  list: (workspaceId: string) =>
    withWorkspace(
      workspaceId,
      async (c) =>
        (
          await c.query(
            "SELECT * FROM ideas WHERE workspace_id=$1 ORDER BY created_at DESC",
            [workspaceId],
          )
        ).rows,
    ),
  get: (workspaceId: string, id: string) =>
    withWorkspace(
      workspaceId,
      async (c) =>
        (
          await c.query("SELECT * FROM ideas WHERE workspace_id=$1 AND id=$2", [
            workspaceId,
            id,
          ])
        ).rows[0] ?? null,
    ),
  create: (workspaceId: string, userId: string, b: CreateIdeaBody) =>
    withWorkspace(
      workspaceId,
      async (c) =>
        (
          await c.query(
            `INSERT INTO ideas (workspace_id, created_by, title, raw_description, geography)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [workspaceId, userId, b.title, b.rawDescription, b.geography],
          )
        ).rows[0],
    ),
};
