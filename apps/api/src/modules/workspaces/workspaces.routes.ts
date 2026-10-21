import { Router } from "express";
import { pool } from "../../lib/db.js";
import { requireRole, requireWorkspace } from "../../middleware/auth.js";
import { HttpError } from "../../middleware/errorHandler.js";

export const workspacesRouter = Router();

const userIdPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

workspacesRouter.get("/", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT w.id, w.name, m.role FROM workspaces w
       JOIN workspace_members m ON m.workspace_id = w.id
      WHERE m.user_id = $1 ORDER BY w.created_at DESC`,
    [req.user!.id],
  );
  res.json({ data: rows });
});

workspacesRouter.post("/", async (req, res) => {
  const name = String(req.body?.name ?? "My workspace").slice(0, 120);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "INSERT INTO workspaces (name, owner_id) VALUES ($1,$2) RETURNING id, name",
      [name, req.user!.id],
    );
    await client.query(
      "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1,$2,'owner')",
      [rows[0].id, req.user!.id],
    );
    await client.query("COMMIT");
    res.status(201).json({ data: rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

workspacesRouter.patch(
  "/:id/members/:userId",
  requireWorkspace,
  requireRole("owner"),
  async (req, res) => {
    const targetUserId = req.params.userId;
    if (typeof targetUserId !== "string" || !userIdPattern.test(targetUserId))
      throw new HttpError(400, "invalid_user_id", "Malformed user id");

    const { rows } = await pool.query(
      `UPDATE workspace_members
          SET role = 'owner'
        WHERE workspace_id = $1 AND user_id = $2
        RETURNING user_id, role`,
      [req.workspaceId, targetUserId],
    );
    if (!rows[0])
      throw new HttpError(
        404,
        "member_not_found",
        "Target user is not a member of this workspace",
      );

    res.json({ data: rows[0] });
  },
);
