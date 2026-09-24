import { jwtVerify } from "jose";
import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { pool } from "../lib/db.js";
import { HttpError } from "./errorHandler.js";

const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);

declare global {
  namespace Express {
    interface Request { user?: { id: string; email?: string }; workspaceId?: string; }
  }
}

/** Verifies the Supabase JWT. TODO(Backend): switch to JWKS verification if the project uses asymmetric keys. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) throw new HttpError(401, "unauthenticated", "Missing bearer token");
  try {
    const { payload } = await jwtVerify(h.slice(7), secret);
    req.user = { id: String(payload.sub), email: payload.email as string | undefined };
    next();
  } catch {
    throw new HttpError(401, "unauthenticated", "Invalid or expired token");
  }
};

/** Resolves :workspaceId and verifies membership. Every workspace-scoped route uses this. */
export const requireWorkspace: RequestHandler = async (req, _res, next) => {
  const workspaceId = req.params.workspaceId;
  const { rows } = await pool.query(
    "SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
    [workspaceId, req.user!.id],
  );
  if (!rows[0]) throw new HttpError(403, "forbidden", "Not a member of this workspace");
  req.workspaceId = workspaceId;
  next();
};
