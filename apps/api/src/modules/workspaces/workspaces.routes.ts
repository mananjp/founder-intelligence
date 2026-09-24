import { Router } from "express";
import { pool } from "../../lib/db.js";

export const workspacesRouter = Router();

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
    const { rows } = await client.query("INSERT INTO workspaces (name, owner_id) VALUES ($1,$2) RETURNING id, name", [name, req.user!.id]);
    await client.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1,$2,'owner')", [rows[0].id, req.user!.id]);
    await client.query("COMMIT");
    res.status(201).json({ data: rows[0] });
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
});
