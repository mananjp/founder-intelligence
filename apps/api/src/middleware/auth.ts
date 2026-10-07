import { jwtVerify } from "jose";
import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { pool } from "../lib/db.js";
import { HttpError } from "./errorHandler.js";

const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

const roleRank: Record<WorkspaceRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

function isWorkspaceRole(role: unknown): role is WorkspaceRole {
  return (
    role === "owner" ||
    role === "admin" ||
    role === "member" ||
    role === "viewer"
  );
}

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email?: string };
      workspaceId?: string;
      workspaceRole?: WorkspaceRole;
    }
  }
}

/** Verifies the Supabase JWT. TODO(Backend): switch to JWKS verification if the project uses asymmetric keys. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer "))
    throw new HttpError(401, "unauthenticated", "Missing bearer token");
  try {
    const { payload } = await jwtVerify(h.slice(7), secret);
    req.user = {
      id: String(payload.sub),
      email: payload.email as string | undefined,
    };
    next();
  } catch {
    throw new HttpError(401, "unauthenticated", "Invalid or expired token");
  }
};

/** Resolves :workspaceId and verifies membership. Every workspace-scoped route uses this. */
export const requireWorkspace: RequestHandler = async (req, _res, next) => {
  const rawWorkspaceId = req.params.workspaceId ?? req.params.id;
  if (typeof rawWorkspaceId !== "string")
    throw new HttpError(400, "invalid_workspace", "Malformed workspace id");
  const workspaceId = rawWorkspaceId;
  const { rows } = await pool.query(
    "SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
    [workspaceId, req.user!.id],
  );
  if (!rows[0])
    throw new HttpError(403, "forbidden", "Not a member of this workspace");
  if (!isWorkspaceRole(rows[0].role))
    throw new HttpError(403, "forbidden", "Invalid workspace role");
  req.workspaceId = workspaceId;
  req.workspaceRole = rows[0].role;
  next();
};

/** Requires at least the specified role; requireWorkspace must run first. */
export function requireRole(minimumRole: WorkspaceRole): RequestHandler {
  return (req, _res, next) => {
    if (!req.user)
      throw new HttpError(401, "unauthenticated", "Authentication required");
    if (
      !req.workspaceRole ||
      !req.workspaceId ||
      roleRank[req.workspaceRole] < roleRank[minimumRole]
    )
      throw new HttpError(403, "forbidden", "Insufficient workspace role");
    next();
  };
}
