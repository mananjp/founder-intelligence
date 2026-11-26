import express from "express";
import request from "supertest";
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Competitor,
  CompetitorClass,
  CompetitorDetail,
  CustomerSegment,
  CustomerSegmentDetail,
  Signal,
  SignalDetail,
} from "@fi/contracts";
import { env } from "../src/config/env.js";
import { pool } from "../src/lib/db.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { requireAuth } from "../src/middleware/auth.js";
import { competitorsRouter } from "../src/modules/competitors/competitors.routes.js";
import { customersRouter } from "../src/modules/customers/customers.routes.js";
import { signalsRouter } from "../src/modules/signals/signals.routes.js";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const ideaId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000004";
const competitorId = "00000000-0000-4000-8000-000000000010";
const segmentId = "00000000-0000-4000-8000-000000000020";
const signalId = "00000000-0000-4000-8000-000000000030";
const claimId = "00000000-0000-4000-8000-000000000040";
const evidenceId = "00000000-0000-4000-8000-000000000050";
const sourceId = "00000000-0000-4000-8000-000000000060";
const nowIso = new Date("2026-11-26T00:00:00.000Z").toISOString();

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
  v1.use(
    "/workspaces/:workspaceId/ideas/:ideaId/competitors",
    competitorsRouter,
  );
  v1.use("/workspaces/:workspaceId/ideas/:ideaId/customers", customersRouter);
  v1.use("/workspaces/:workspaceId/ideas/:ideaId/signals", signalsRouter);
  app.use("/v1", v1);
  app.use(errorHandler);
  return app;
}

const mockIdeaRow = {
  id: ideaId,
  workspace_id: workspaceId,
  created_by: userId,
  title: "Evidence-backed market intelligence",
  raw_description: "Decision-grade market intelligence for founders",
  category: "B2B SaaS",
  geography: ["UAE", "India"],
  stage: "exploring",
  status: "active",
  created_at: nowIso,
  updated_at: nowIso,
};

function mockWorkspaceClient(
  handler: (sql: string, params?: unknown[]) => { rows: unknown[] },
) {
  const clientQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    if (
      sql === "BEGIN" ||
      sql === "COMMIT" ||
      sql === "ROLLBACK" ||
      sql.includes("set_config")
    ) {
      return { rows: [] };
    }
    if (sql.includes("FROM ideas WHERE workspace_id=$1 AND id=$2")) {
      return { rows: [mockIdeaRow] };
    }
    return handler(sql, params);
  });

  poolConnect.mockResolvedValue({
    query: clientQuery,
    release: vi.fn(),
  } as never);

  return clientQuery;
}

describe("Intelligence Contracts & APIs (Competitors, Customers, Signals)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    poolQuery.mockResolvedValue({ rows: [{ role: "member" }] } as never);
  });

  describe("Zod Contracts", () => {
    it("supports all 5 competitor classes from Product Bible §13", () => {
      const classes = [
        "direct",
        "indirect",
        "substitute",
        "emerging",
        "internal_diy",
      ] as const;
      for (const kind of classes) {
        expect(CompetitorClass.parse(kind)).toBe(kind);
      }
      expect(() => CompetitorClass.parse("unknown")).toThrow();
    });

    it("validates Competitor, CustomerSegment, Signal and Detail schemas", () => {
      const claim = {
        id: claimId,
        ideaId,
        statement: "Rival Inc charges $99/mo for pro tier.",
        module: "competitive" as const,
        status: "verified" as const,
        evidenceIds: [evidenceId],
      };

      const comp = CompetitorDetail.parse({
        id: competitorId,
        workspaceId,
        ideaId,
        name: "Rival Inc",
        website: "https://rival.example.com",
        kind: "direct",
        description: "Incumbent platform",
        metadata: { pricing: "$99/mo", claimIds: [claimId] },
        createdAt: nowIso,
        updatedAt: nowIso,
        linkedClaims: [claim],
      });
      expect(Competitor.parse(comp).kind).toBe("direct");
      expect(comp.linkedClaims).toHaveLength(1);

      const seg = CustomerSegmentDetail.parse({
        id: segmentId,
        workspaceId,
        ideaId,
        name: "Seed-stage B2B Founders",
        description: "Founders validating new products in UAE & India",
        industry: "Software",
        companySize: "1-10",
        buyerPersona: "Founder / CEO",
        userPersona: "Founder / PM",
        jobsToBeDone: ["Validate willingness to pay before building"],
        createdAt: nowIso,
        updatedAt: nowIso,
        linkedClaims: [{ ...claim, module: "customer" }],
      });
      expect(CustomerSegment.parse(seg).jobsToBeDone).toHaveLength(1);

      const sig = SignalDetail.parse({
        id: signalId,
        workspaceId,
        ideaId,
        runId: null,
        sourceId,
        signalType: "community_discussion",
        title: "Rising Reddit complaints on competitor pricing",
        description: "18 threads in r/SaaS citing sudden price hikes",
        strength: "high",
        observedAt: nowIso,
        metadata: { source: "reddit" },
        createdAt: nowIso,
        linkedClaims: [{ ...claim, module: "demand" }],
      });
      expect(Signal.parse(sig).strength).toBe("high");
    });
  });

  describe("HTTP Endpoints", () => {
    it("requires authentication on intelligence endpoints", async () => {
      const app = createApp();
      const res = await request(app).get(
        `/v1/workspaces/${workspaceId}/ideas/${ideaId}/competitors`,
      );
      expect(res.status).toBe(401);
    });

    it("lists competitors with optional class filter and returns detail with linked claims", async () => {
      const app = createApp();
      const token = await createAuthToken();
      const clientQuery = mockWorkspaceClient((sql) => {
        if (sql.includes("FROM competitors") && sql.includes("ORDER BY")) {
          return {
            rows: [
              {
                id: competitorId,
                workspace_id: workspaceId,
                idea_id: ideaId,
                name: "Manual Spreadsheets",
                website: null,
                kind: "internal_diy",
                description: "Founders tracking market notes in Excel",
                metadata: { claimIds: [claimId] },
                created_at: nowIso,
                updated_at: nowIso,
              },
            ],
          };
        }
        if (sql.includes("FROM competitors") && sql.includes("AND id = $3")) {
          return {
            rows: [
              {
                id: competitorId,
                workspace_id: workspaceId,
                idea_id: ideaId,
                name: "Manual Spreadsheets",
                website: null,
                kind: "internal_diy",
                description: "Founders tracking market notes in Excel",
                metadata: { claimIds: [claimId] },
                created_at: nowIso,
                updated_at: nowIso,
              },
            ],
          };
        }
        if (sql.includes("FROM claims c")) {
          return {
            rows: [
              {
                id: claimId,
                idea_id: ideaId,
                statement: "60% of surveyed founders use Notion or Excel.",
                module: "competitive",
                status: "supported",
                evidence_ids: [evidenceId],
              },
            ],
          };
        }
        return { rows: [] };
      });

      const listRes = await request(app)
        .get(
          `/v1/workspaces/${workspaceId}/ideas/${ideaId}/competitors?kind=internal_diy`,
        )
        .set("Authorization", `Bearer ${token}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toHaveLength(1);
      expect(listRes.body.data[0].kind).toBe("internal_diy");
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining("AND kind = $3"),
        [workspaceId, ideaId, "internal_diy"],
      );

      const badFilter = await request(app)
        .get(
          `/v1/workspaces/${workspaceId}/ideas/${ideaId}/competitors?kind=bogus`,
        )
        .set("Authorization", `Bearer ${token}`);
      expect(badFilter.status).toBe(422);

      const detailRes = await request(app)
        .get(
          `/v1/workspaces/${workspaceId}/ideas/${ideaId}/competitors/${competitorId}`,
        )
        .set("Authorization", `Bearer ${token}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.linkedClaims).toHaveLength(1);
      expect(detailRes.body.data.linkedClaims[0].id).toBe(claimId);
    });

    it("lists customer segments and returns detail with linked claims", async () => {
      const app = createApp();
      const token = await createAuthToken();
      mockWorkspaceClient((sql) => {
        if (sql.includes("FROM customer_segments")) {
          return {
            rows: [
              {
                id: segmentId,
                workspace_id: workspaceId,
                idea_id: ideaId,
                name: "UAE SME Founders",
                description: "SMEs launching new digital verticals",
                industry: "Retail & Tech",
                company_size: "10-50",
                buyer_persona: "Managing Director",
                user_persona: "Strategy Lead",
                jobs_to_be_done: ["Assess market entry risk"],
                created_at: nowIso,
                updated_at: nowIso,
              },
            ],
          };
        }
        if (sql.includes("FROM claims c")) {
          return {
            rows: [
              {
                id: claimId,
                idea_id: ideaId,
                statement: "UAE SMEs spend 3 weeks on manual market sizing.",
                module: "customer",
                status: "directional",
                evidence_ids: [evidenceId],
              },
            ],
          };
        }
        return { rows: [] };
      });

      const listRes = await request(app)
        .get(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/customers`)
        .set("Authorization", `Bearer ${token}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data[0].buyerPersona).toBe("Managing Director");

      const detailRes = await request(app)
        .get(
          `/v1/workspaces/${workspaceId}/ideas/${ideaId}/customers/${segmentId}`,
        )
        .set("Authorization", `Bearer ${token}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.linkedClaims).toHaveLength(1);
      expect(detailRes.body.data.linkedClaims[0].module).toBe("customer");
    });

    it("lists signals with filters, returns detail with linked claims, and 404s when missing", async () => {
      const app = createApp();
      const token = await createAuthToken();
      mockWorkspaceClient((sql) => {
        if (sql.includes("FROM signals") && sql.includes("AND id = $3")) {
          return { rows: [] };
        }
        if (sql.includes("FROM signals")) {
          return {
            rows: [
              {
                id: signalId,
                workspace_id: workspaceId,
                idea_id: ideaId,
                run_id: null,
                source_id: sourceId,
                signal_type: "search_interest",
                title: "Search growth for AI market validation in India",
                description: "Monthly searches grew 45% YoY.",
                strength: "high",
                observed_at: nowIso,
                metadata: {},
                created_at: nowIso,
              },
            ],
          };
        }
        return { rows: [] };
      });

      const listRes = await request(app)
        .get(
          `/v1/workspaces/${workspaceId}/ideas/${ideaId}/signals?signalType=search_interest&strength=high`,
        )
        .set("Authorization", `Bearer ${token}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toHaveLength(1);
      expect(listRes.body.data[0].signalType).toBe("search_interest");

      const notFoundRes = await request(app)
        .get(
          `/v1/workspaces/${workspaceId}/ideas/${ideaId}/signals/${signalId}`,
        )
        .set("Authorization", `Bearer ${token}`);
      expect(notFoundRes.status).toBe(404);
      expect(notFoundRes.body.error.code).toBe("not_found");
    });
  });
});
