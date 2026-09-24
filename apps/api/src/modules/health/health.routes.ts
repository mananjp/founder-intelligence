import { Router } from "express";
import { pool } from "../../lib/db.js";
import { redis } from "../../lib/queue.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => res.json({ status: "ok" }));

healthRouter.get("/ready", async (_req, res) => {
  const checks: Record<string, boolean> = {};
  try {
    await pool.query("SELECT 1");
    checks.db = true;
  } catch {
    checks.db = false;
  }
  try {
    await redis.ping();
    checks.redis = true;
  } catch {
    checks.redis = false;
  }
  const ok = Object.values(checks).every(Boolean);
  res
    .status(ok ? 200 : 503)
    .json({ status: ok ? "ready" : "degraded", checks });
});
