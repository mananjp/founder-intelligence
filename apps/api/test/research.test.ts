import express from "express";
import request from "supertest";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "../src/lib/db.js";
import { env } from "../src/config/env.js";
import { redis } from "../src/lib/queue.js";
import { requireAuth } from "../src/middleware/auth.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { researchRouter } from "../src/modules/research/research.routes.js";
import { researchService } from "../src/modules/research/research.service.js";
import { researchRepo } from "../src/modules/research/research.repo.js";
import { ideasService } from "../src/modules/ideas/ideas.service.js";
import {
  publishRunEvent,
  getStreamHistory,
  parseStreamFields,
} from "../src/lib/sse.js";
import type { RunEvent } from "@fi/contracts";

// Mock IORedis constructor so the durable SSE subscriber never opens a real Redis
// connection (avoids ECONNREFUSED noise and hanging test connections).
// vi.mock is hoisted before imports so the `redis` singleton and any `new IORedis()`
// call inside streamRunEvents both use this fake implementation.
vi.mock("ioredis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ioredis")>();
  const MockIORedis = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue(undefined),
    xadd: vi.fn().mockResolvedValue("1730000000000-0"),
    xrange: vi.fn().mockResolvedValue([]),
    publish: vi.fn().mockResolvedValue(1),
    disconnect: vi.fn(),
    status: "ready",
  }));
  return { ...actual, default: MockIORedis };
});

const workspaceId = "00000000-0000-4000-8000-000000000001";
const ideaId = "00000000-0000-4000-8000-000000000002";
const runId = "00000000-0000-4000-8000-000000000003";
const userId = "00000000-0000-4000-8000-000000000004";
const briefId = "00000000-0000-4000-8000-000000000005";

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
  v1.use("/workspaces/:workspaceId/ideas/:ideaId/research", researchRouter);
  app.use("/v1", v1);
  app.use(errorHandler);
  return app;
}

const mockIdea = {
  id: ideaId,
  workspace_id: workspaceId,
  created_by: userId,
  title: "AI Logistics Route Optimizer",
  raw_description: "Real-time dispatch optimization for fleet operators",
  category: "Logistics",
  geography: ["UAE", "KSA"],
  stage: "exploring" as const,
  status: "active",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockRunRow = {
  id: runId,
  workspace_id: workspaceId,
  idea_id: ideaId,
  brief_id: briefId,
  depth: "quick",
  geography: ["UAE"],
  state: "created",
  budget_usd: "5.00",
  spent_usd: "0.00",
  last_completed_stage: null,
  cancel_requested_at: null,
  created_by: userId,
  created_at: new Date().toISOString(),
  completed_at: null,
};

describe("Research Runs Lifecycle & Durable SSE", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    poolConnect.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    } as any);

    poolQuery.mockImplementation(async (sql: any, params?: any) => {
      const q = typeof sql === "string" ? sql : sql.text;
      if (q.includes("workspace_members")) {
        return { rows: [{ role: "owner" }] } as any;
      }
      return { rows: [] } as any;
    });

    vi.spyOn(ideasService, "get").mockResolvedValue(mockIdea as any);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe("Unit: Stream Event Parsing & History", () => {
    it("parses data field in stream entry", () => {
      const event: RunEvent = {
        type: "stage.started",
        stage: "scoping",
        state: "scoping",
      };
      const parsed = parseStreamFields(["data", JSON.stringify(event)]);
      expect(parsed.type).toBe("stage.started");
      expect(parsed.stage).toBe("scoping");
    });

    it("parses payload field in stream entry as fallback", () => {
      const event: RunEvent = {
        type: "stage.completed",
        stage: "planning",
        state: "planning",
      };
      const parsed = parseStreamFields(["payload", JSON.stringify(event)]);
      expect(parsed.type).toBe("stage.completed");
      expect(parsed.stage).toBe("planning");
    });

    it("publishes run event to Redis stream and pub/sub", async () => {
      const xaddSpy = vi.spyOn(redis, "xadd").mockResolvedValue("1730000000000-0" as any);
      const pubSpy = vi.spyOn(redis, "publish").mockResolvedValue(1 as any);

      const streamId = await publishRunEvent(runId, {
        type: "stage.started",
        stage: "discovering",
        state: "discovering",
      });

      expect(streamId).toBe("1730000000000-0");
      expect(xaddSpy).toHaveBeenCalledWith(
        `run:${runId}:events`,
        "MAXLEN",
        "~",
        "1000",
        "*",
        "type",
        "stage.started",
        "data",
        expect.any(String),
      );
      expect(pubSpy).toHaveBeenCalledWith(`run:${runId}`, expect.any(String));
    });

    it("reads stream history from Redis stream", async () => {
      const event1: RunEvent = { type: "stage.started", stage: "scoping" };
      const event2: RunEvent = { type: "stage.completed", stage: "scoping" };

      vi.spyOn(redis, "xrange").mockResolvedValue([
        ["100-0", ["data", JSON.stringify(event1)]],
        ["101-0", ["data", JSON.stringify(event2)]],
      ] as any);

      const history = await getStreamHistory(runId);
      expect(history.length).toBe(2);
      expect(history[0].id).toBe("100-0");
      expect(history[0].event.stage).toBe("scoping");
      expect(history[1].id).toBe("101-0");
      expect(history[1].event.type).toBe("stage.completed");
    });

    it("replays only events strictly after fromId when provided", async () => {
      const event1: RunEvent = { type: "stage.started", stage: "scoping" };
      const event2: RunEvent = { type: "stage.completed", stage: "scoping" };
      const event3: RunEvent = { type: "stage.started", stage: "planning" };

      vi.spyOn(redis, "xrange").mockResolvedValue([
        ["100-0", ["data", JSON.stringify(event1)]],
        ["101-0", ["data", JSON.stringify(event2)]],
        ["102-0", ["data", JSON.stringify(event3)]],
      ] as any);

      const missed = await getStreamHistory(runId, "101-0");
      expect(missed.length).toBe(1);
      expect(missed[0].id).toBe("102-0");
      expect(missed[0].event.stage).toBe("planning");
    });
  });

  describe("Service: Run Lifecycle Management", () => {
    it("listRuns returns mapped runs", async () => {
      vi.spyOn(researchRepo, "listRuns").mockResolvedValue([
        {
          id: runId,
          workspaceId,
          ideaId,
          briefId,
          depth: "quick",
          geography: ["UAE"],
          state: "created",
          budgetUsd: 5.0,
          spentUsd: 0,
          createdBy: userId,
          createdAt: new Date().toISOString(),
        },
      ]);

      const runs = await researchService.listRuns(workspaceId, ideaId);
      expect(runs.length).toBe(1);
      expect(runs[0].id).toBe(runId);
      expect(runs[0].depth).toBe("quick");
    });

    it("getRun returns 404 when run does not exist", async () => {
      vi.spyOn(researchRepo, "getRun").mockResolvedValue(null);

      await expect(
        researchService.getRun(workspaceId, ideaId, "nonexistent-id"),
      ).rejects.toThrow("Research run not found");
    });

    it("cancelRun transitions active run to cancelled", async () => {
      vi.spyOn(researchRepo, "getRun").mockResolvedValue({
        id: runId,
        workspaceId,
        ideaId,
        briefId,
        depth: "quick",
        geography: ["UAE"],
        state: "discovering",
        budgetUsd: 5.0,
        spentUsd: 1.2,
        createdBy: userId,
        createdAt: new Date().toISOString(),
      });

      vi.spyOn(researchRepo, "cancelRun").mockResolvedValue({
        id: runId,
        workspaceId,
        ideaId,
        briefId,
        depth: "quick",
        geography: ["UAE"],
        state: "cancelled",
        budgetUsd: 5.0,
        spentUsd: 1.2,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      const cancelled = await researchService.cancelRun(workspaceId, ideaId, runId);
      expect(cancelled.state).toBe("cancelled");
    });

    it("cancelRun is idempotent for already cancelled run", async () => {
      vi.spyOn(researchRepo, "getRun").mockResolvedValue({
        id: runId,
        workspaceId,
        ideaId,
        briefId,
        depth: "quick",
        geography: ["UAE"],
        state: "cancelled",
        budgetUsd: 5.0,
        spentUsd: 1.2,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      const res = await researchService.cancelRun(workspaceId, ideaId, runId);
      expect(res.state).toBe("cancelled");
    });

    it("cancelRun throws 409 if run is already completed", async () => {
      vi.spyOn(researchRepo, "getRun").mockResolvedValue({
        id: runId,
        workspaceId,
        ideaId,
        briefId,
        depth: "quick",
        geography: ["UAE"],
        state: "completed",
        budgetUsd: 5.0,
        spentUsd: 3.5,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      await expect(
        researchService.cancelRun(workspaceId, ideaId, runId),
      ).rejects.toThrow("Cannot cancel an already completed research run");
    });
  });

  describe("Integration: API Endpoints (Supertest)", () => {
    const app = createApp();

    it("GET /runs lists all research runs for idea", async () => {
      const token = await createAuthToken();
      vi.spyOn(researchRepo, "listRuns").mockResolvedValue([
        {
          id: runId,
          workspaceId,
          ideaId,
          briefId,
          depth: "quick",
          geography: ["UAE"],
          state: "created",
          budgetUsd: 5.0,
          spentUsd: 0,
          createdBy: userId,
          createdAt: new Date().toISOString(),
        },
      ]);

      const res = await request(app)
        .get(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/research/runs`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe(runId);
    });

    it("GET /runs/:runId returns specific run details", async () => {
      const token = await createAuthToken();
      vi.spyOn(researchRepo, "getRun").mockResolvedValue({
        id: runId,
        workspaceId,
        ideaId,
        briefId,
        depth: "standard",
        geography: ["UAE", "India"],
        state: "extracting",
        budgetUsd: 10.0,
        spentUsd: 4.2,
        createdBy: userId,
        createdAt: new Date().toISOString(),
      });

      const res = await request(app)
        .get(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/research/runs/${runId}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(runId);
      expect(res.body.data.state).toBe("extracting");
      expect(res.body.data.depth).toBe("standard");
    });

    it("GET /runs/:runId returns 404 if run not found", async () => {
      const token = await createAuthToken();
      vi.spyOn(researchRepo, "getRun").mockResolvedValue(null);

      const res = await request(app)
        .get(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/research/runs/00000000-0000-4000-8000-000000000999`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("run_not_found");
    });

    it("POST /runs creates and enqueues a new research run", async () => {
      const token = await createAuthToken();

      poolConnect.mockResolvedValue({
        query: vi.fn().mockImplementation(async (sql: any) => {
          const q = typeof sql === "string" ? sql : sql.text;
          if (q.includes("research_briefs")) {
            return { rows: [{ id: briefId }] };
          }
          if (q.includes("INSERT INTO research_runs")) {
            return { rows: [mockRunRow] };
          }
          return { rows: [] };
        }),
        release: vi.fn(),
      } as any);

      vi.spyOn(redis, "xadd").mockResolvedValue("1730000000000-0" as any);
      vi.spyOn(redis, "publish").mockResolvedValue(1 as any);

      const res = await request(app)
        .post(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/research/runs`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          depth: "quick",
          geography: ["UAE"],
        });

      expect(res.status).toBe(202);
      expect(res.body.data.id).toBe(runId);
    });

    it("POST /runs returns 409 if research brief is missing", async () => {
      const token = await createAuthToken();

      poolConnect.mockResolvedValue({
        query: vi.fn().mockImplementation(async (sql: any) => {
          const q = typeof sql === "string" ? sql : sql.text;
          if (q.includes("research_briefs")) {
            return { rows: [] };
          }
          return { rows: [] };
        }),
        release: vi.fn(),
      } as any);

      const res = await request(app)
        .post(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/research/runs`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          depth: "quick",
          geography: ["UAE"],
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("brief_missing");
    });

    it("POST /runs/:runId/cancel cancels the research run", async () => {
      const token = await createAuthToken();

      vi.spyOn(researchRepo, "getRun").mockResolvedValue({
        id: runId,
        workspaceId,
        ideaId,
        briefId,
        depth: "quick",
        geography: ["UAE"],
        state: "discovering",
        budgetUsd: 5.0,
        spentUsd: 1.0,
        createdBy: userId,
        createdAt: new Date().toISOString(),
      });

      vi.spyOn(researchRepo, "cancelRun").mockResolvedValue({
        id: runId,
        workspaceId,
        ideaId,
        briefId,
        depth: "quick",
        geography: ["UAE"],
        state: "cancelled",
        budgetUsd: 5.0,
        spentUsd: 1.0,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      vi.spyOn(redis, "xadd").mockResolvedValue("1730000000000-1" as any);
      vi.spyOn(redis, "publish").mockResolvedValue(1 as any);

      const res = await request(app)
        .post(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/research/runs/${runId}/cancel`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.state).toBe("cancelled");
    });

    it("GET /runs/:runId/events calls streamRunEvents with correct runId and lastEventId", async () => {
      // Verifies routing without holding a long-lived SSE connection open.
      // Durable-replay internals are covered by the unit tests above.
      const token = await createAuthToken();

      vi.spyOn(researchRepo, "getRun").mockResolvedValue({
        id: runId,
        workspaceId,
        ideaId,
        briefId,
        depth: "quick",
        geography: ["UAE"],
        state: "scoping",
        budgetUsd: 5.0,
        spentUsd: 0,
        createdBy: userId,
        createdAt: new Date().toISOString(),
      });

      // Intercept streamRunEvents so it immediately writes SSE headers and ends.
      const sseLib = await import("../src/lib/sse.js");
      const streamSpy = vi.spyOn(sseLib, "streamRunEvents").mockImplementation(
        async (_runId, res, _opts) => {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          res.end();
        },
      );

      const res = await request(app)
        .get(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/research/runs/${runId}/events`)
        .set("Authorization", `Bearer ${token}`)
        .set("Last-Event-ID", "1730000000000-0");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/event-stream");
      expect(streamSpy).toHaveBeenCalledWith(
        runId,
        expect.anything(),
        expect.objectContaining({ lastEventId: "1730000000000-0" }),
      );
    });
  });
});