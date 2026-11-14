import express from "express";
import request from "supertest";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "../src/lib/db.js";
import { env } from "../src/config/env.js";
import { requireAuth } from "../src/middleware/auth.js";
import { errorHandler, HttpError } from "../src/middleware/errorHandler.js";
import { billingRouter } from "../src/modules/billing/billing.routes.js";
import { billingService } from "../src/modules/billing/billing.service.js";
import { billingRepo } from "../src/modules/billing/billing.repo.js";
import { enforcePlanLimits } from "../src/modules/billing/billing.middleware.js";
import { researchRouter } from "../src/modules/research/research.routes.js";
import { researchService } from "../src/modules/research/research.service.js";
import { PLAN_TIERS } from "@fi/contracts";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const ideaId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";

const poolQuery = vi.spyOn(pool, "query");
const poolConnect = vi.spyOn(pool, "connect");

async function createAuthToken(sub: string = userId) {
  const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
  return new SignJWT({ email: "founder@example.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secret);
}

function createApp() {
  const app = express();
  app.use(express.json());
  const v1 = express.Router();
  v1.use(requireAuth);
  v1.use("/workspaces/:workspaceId/billing", billingRouter);
  v1.use("/workspaces/:workspaceId/ideas/:ideaId/research", researchRouter);
  app.use("/v1", v1);
  app.use(errorHandler);
  return app;
}

describe("Task 36: Plan limits + usage", () => {
  let token: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    token = await createAuthToken();

    poolConnect.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    } as any);

    poolQuery.mockImplementation(async (sql: any) => {
      const q = typeof sql === "string" ? sql : sql.text;
      if (q.includes("workspace_members")) {
        return { rows: [{ role: "owner" }] } as any;
      }
      return { rows: [] } as any;
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe("Unit: billingService", () => {
    it("defaults to 'free' plan limits when no subscription exists", async () => {
      vi.spyOn(billingRepo, "getSubscription").mockResolvedValue(null);
      vi.spyOn(billingRepo, "countRunsInPeriod").mockResolvedValue(2);

      const usage = await billingService.getUsage(workspaceId);
      expect(usage.plan).toBe("free");
      expect(usage.runsLimit).toBe(PLAN_TIERS.free.runsPerMonth);
      expect(usage.allowedDepths).toEqual(["quick"]);
      expect(usage.runsUsed).toBe(2);
    });

    it("respects active 'pro' subscription limits", async () => {
      vi.spyOn(billingRepo, "getSubscription").mockResolvedValue({
        workspaceId,
        plan: "pro",
        status: "active",
        updatedAt: new Date().toISOString(),
      });
      vi.spyOn(billingRepo, "countRunsInPeriod").mockResolvedValue(10);

      const usage = await billingService.getUsage(workspaceId);
      expect(usage.plan).toBe("pro");
      expect(usage.runsLimit).toBe(PLAN_TIERS.pro.runsPerMonth);
      expect(usage.allowedDepths).toEqual(["quick", "standard"]);
      expect(usage.runsUsed).toBe(10);
    });

    it("throws PLAN_LIMIT HttpError when requesting disallowed depth", async () => {
      vi.spyOn(billingRepo, "getSubscription").mockResolvedValue(null); // free plan
      vi.spyOn(billingRepo, "countRunsInPeriod").mockResolvedValue(0);

      await expect(
        billingService.assertCanStartRun(workspaceId, "deep"),
      ).rejects.toMatchObject({
        status: 403,
        code: "PLAN_LIMIT",
        message: expect.stringContaining("Research depth 'deep' is not allowed"),
      });
    });

    it("throws PLAN_LIMIT HttpError when monthly run limit is reached", async () => {
      vi.spyOn(billingRepo, "getSubscription").mockResolvedValue(null); // free plan, limit 5
      vi.spyOn(billingRepo, "countRunsInPeriod").mockResolvedValue(5);

      await expect(
        billingService.assertCanStartRun(workspaceId, "quick"),
      ).rejects.toMatchObject({
        status: 403,
        code: "PLAN_LIMIT",
        message: expect.stringContaining("Monthly research run limit reached"),
      });
    });

    it("passes assertCanStartRun when depth and runs are within quota", async () => {
      vi.spyOn(billingRepo, "getSubscription").mockResolvedValue(null);
      vi.spyOn(billingRepo, "countRunsInPeriod").mockResolvedValue(1);

      await expect(
        billingService.assertCanStartRun(workspaceId, "quick"),
      ).resolves.toBeUndefined();
    });
  });

  describe("HTTP: Usage & Tiers endpoints", () => {
    it("GET /v1/workspaces/:workspaceId/billing/usage returns 200 with usage", async () => {
      vi.spyOn(billingRepo, "getSubscription").mockResolvedValue({
        workspaceId,
        plan: "pro",
        status: "active",
        updatedAt: new Date().toISOString(),
      });
      vi.spyOn(billingRepo, "countRunsInPeriod").mockResolvedValue(4);

      const app = createApp();
      const res = await request(app)
        .get(`/v1/workspaces/${workspaceId}/billing/usage`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        workspaceId,
        plan: "pro",
        status: "active",
        runsUsed: 4,
        runsLimit: PLAN_TIERS.pro.runsPerMonth,
        allowedDepths: ["quick", "standard"],
      });
    });

    it("GET /v1/workspaces/:workspaceId/billing/tiers returns 200 with tier config", async () => {
      const app = createApp();
      const res = await request(app)
        .get(`/v1/workspaces/${workspaceId}/billing/tiers`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.free).toBeDefined();
      expect(res.body.data.pro).toBeDefined();
      expect(res.body.data.enterprise).toBeDefined();
    });
  });

  describe("HTTP: Middleware enforcement on POST research/runs", () => {
    it("returns 403 PLAN_LIMIT when free tier attempts standard research run", async () => {
      vi.spyOn(billingRepo, "getSubscription").mockResolvedValue(null); // free plan
      vi.spyOn(billingRepo, "countRunsInPeriod").mockResolvedValue(0);

      const app = createApp();
      const res = await request(app)
        .post(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/research/runs`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          depth: "standard",
          geography: ["UAE"],
          goals: ["Competitor breakdown"],
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatchObject({
        code: "PLAN_LIMIT",
        message: expect.stringContaining("Research depth 'standard' is not allowed"),
      });
    });

    it("returns 403 PLAN_LIMIT when monthly run limit is exceeded", async () => {
      vi.spyOn(billingRepo, "getSubscription").mockResolvedValue(null); // free plan, limit 5
      vi.spyOn(billingRepo, "countRunsInPeriod").mockResolvedValue(5);

      const app = createApp();
      const res = await request(app)
        .post(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/research/runs`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          depth: "quick",
          geography: ["India"],
          goals: ["Market sizing"],
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatchObject({
        code: "PLAN_LIMIT",
        message: expect.stringContaining("Monthly research run limit reached"),
      });
    });

    it("allows POST /runs when within plan limits", async () => {
      vi.spyOn(billingRepo, "getSubscription").mockResolvedValue(null); // free
      vi.spyOn(billingRepo, "countRunsInPeriod").mockResolvedValue(2); // 2 < 5
      vi.spyOn(researchService, "startRun").mockResolvedValue({
        id: "00000000-0000-4000-8000-000000000099",
        workspaceId,
        ideaId,
        briefId: "00000000-0000-4000-8000-000000000088",
        depth: "quick",
        geography: ["UAE"],
        state: "created",
        budgetUsd: 1,
        spentUsd: 0,
        createdBy: userId,
        createdAt: new Date().toISOString(),
      });

      const app = createApp();
      const res = await request(app)
        .post(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/research/runs`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          depth: "quick",
          geography: ["UAE"],
        });

      expect(res.status).toBe(202);
      expect(res.body.data.id).toBe("00000000-0000-4000-8000-000000000099");
    });
  });
});

