import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "../src/lib/db.js";
import {
  requireAuth,
  requireRole,
  requireWorkspace,
  type WorkspaceRole,
} from "../src/middleware/auth.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { workspacesRouter } from "../src/modules/workspaces/workspaces.routes.js";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const targetUserId = "00000000-0000-4000-8000-000000000002";
const query = vi.spyOn(pool, "query");

function createApp() {
  const app = express();
  app.use((req, _res, next) => {
    const userId = req.header("x-user-id");
    if (userId) req.user = { id: userId };
    next();
  });
  app.get("/unauth/:workspaceId", requireAuth, requireWorkspace, (_req, res) =>
    res.sendStatus(204),
  );
  app.get(
    "/role-check/:workspaceId/owner",
    requireWorkspace,
    requireRole("owner"),
    (_req, res) => res.sendStatus(204),
  );
  app.get(
    "/role-check/:workspaceId/member",
    requireWorkspace,
    requireRole("member"),
    (_req, res) => res.sendStatus(204),
  );
  app.use("/workspaces", workspacesRouter);
  app.use(errorHandler);
  return app;
}

function mockMembership(role: WorkspaceRole | undefined) {
  query.mockResolvedValueOnce({ rows: role ? [{ role }] : [] } as never);
}

describe("workspace role enforcement", () => {
  beforeEach(() => query.mockReset());
  afterAll(() => query.mockRestore());

  it("keeps unauthenticated requests at 401", async () => {
    await request(createApp()).get(`/unauth/${workspaceId}`).expect(401);
    expect(query).not.toHaveBeenCalled();
  });

  it("allows an owner where owner is required", async () => {
    mockMembership("owner");

    await request(createApp())
      .get(`/role-check/${workspaceId}/owner`)
      .set("x-user-id", "owner-user")
      .expect(204);
  });

  it.each(["admin", "member", "viewer"] as const)(
    "denies a %s where owner is required",
    async (role) => {
      mockMembership(role);

      await request(createApp())
        .get(`/role-check/${workspaceId}/owner`)
        .set("x-user-id", `${role}-user`)
        .expect(403);
    },
  );

  it("allows members for member-level access and denies viewers", async () => {
    mockMembership("member");
    await request(createApp())
      .get(`/role-check/${workspaceId}/member`)
      .set("x-user-id", "member-user")
      .expect(204);

    mockMembership("viewer");
    await request(createApp())
      .get(`/role-check/${workspaceId}/member`)
      .set("x-user-id", "viewer-user")
      .expect(403);
  });

  it("denies users who are not workspace members", async () => {
    mockMembership(undefined);

    await request(createApp())
      .get(`/role-check/${workspaceId}/member`)
      .set("x-user-id", "outsider")
      .expect(403);
  });

  it("allows an owner to promote an existing workspace member", async () => {
    mockMembership("owner");
    query.mockResolvedValueOnce({
      rows: [{ user_id: targetUserId, role: "owner" }],
    } as never);

    const response = await request(createApp())
      .patch(`/workspaces/${workspaceId}/members/${targetUserId}`)
      .set("x-user-id", "owner-user")
      .expect(200);

    expect(response.body.data).toEqual({
      user_id: targetUserId,
      role: "owner",
    });
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("UPDATE workspace_members"),
      [workspaceId, targetUserId],
    );
  });

  it("denies a non-owner from promoting a workspace member", async () => {
    mockMembership("admin");

    await request(createApp())
      .patch(`/workspaces/${workspaceId}/members/${targetUserId}`)
      .set("x-user-id", "admin-user")
      .expect(403);

    expect(query).toHaveBeenCalledTimes(1);
  });

  it("requires the promotion target to be an existing workspace member", async () => {
    mockMembership("owner");
    query.mockResolvedValueOnce({ rows: [] } as never);

    const response = await request(createApp())
      .patch(`/workspaces/${workspaceId}/members/${targetUserId}`)
      .set("x-user-id", "owner-user")
      .expect(404);

    expect(response.body.error.code).toBe("member_not_found");
  });
});
