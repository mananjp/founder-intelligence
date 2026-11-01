import express from "express";
import request from "supertest";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "../src/lib/db.js";
import { env } from "../src/config/env.js";
import { requireAuth, requireWorkspace } from "../src/middleware/auth.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { interviewRouter } from "../src/modules/interview/interview.routes.js";
import { interviewService } from "../src/modules/interview/interview.service.js";
import { interviewRepo } from "../src/modules/interview/interview.repo.js";
import { runFakeAiInterviewTurn } from "../src/modules/interview/interview.fakeAi.js";
import { queryAiInterviewTurn } from "../src/modules/interview/interview.ai.js";
import { ideasService } from "../src/modules/ideas/ideas.service.js";

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
  v1.use("/workspaces/:workspaceId/ideas/:ideaId/interview", interviewRouter);
  app.use("/v1", v1);
  app.use(errorHandler);
  return app;
}

describe("Interview Module — Fake AI & Adaptive Interview Logic", () => {
  it("asks for ICP/customer persona on first turn if missing", () => {
    const res = runFakeAiInterviewTurn({
      ideaId,
      ideaTitle: "AI Logistics Co",
      rawDescription: "Optimizing trucking routes across UAE",
      geography: ["UAE"],
      turnHistory: [],
      founderMessage: "Hello, I am ready to start.",
    });

    expect(res.isComplete).toBe(false);
    expect(res.question).toContain("primary target customer");
    expect(res.draftBrief).toBeUndefined();
  });

  it("extracts customer and asks for problem on turn 2", () => {
    const res = runFakeAiInterviewTurn({
      ideaId,
      ideaTitle: "AI Logistics Co",
      rawDescription: "Optimizing trucking routes across UAE",
      geography: ["UAE"],
      turnHistory: [
        {
          role: "assistant",
          content: "Who is your customer?",
          extracted: {},
        },
      ],
      founderMessage: "Mid-sized fleet operators in Dubai with 20-100 trucks.",
    });

    expect(res.isComplete).toBe(false);
    expect(res.extracted.customer).toBeDefined();
    expect(res.question).toContain("pain point");
  });

  it("extracts problem and asks for alternatives on turn 3", () => {
    const res = runFakeAiInterviewTurn({
      ideaId,
      ideaTitle: "AI Logistics Co",
      rawDescription: "Optimizing trucking routes across UAE",
      geography: ["UAE"],
      turnHistory: [
        {
          role: "assistant",
          content: "Who is your customer?",
          extracted: { customer: "Mid-sized fleet operators" },
        },
        {
          role: "founder",
          content: "Mid-sized fleet operators",
          extracted: { customer: "Mid-sized fleet operators" },
        },
      ],
      founderMessage:
        "The problem is 30% empty miles and manual WhatsApp dispatching chaos.",
    });

    expect(res.isComplete).toBe(false);
    expect(res.extracted.problem).toBeDefined();
    expect(res.question).toContain("existing solutions");
  });

  it("completes interview and generates draftBrief after sufficient context", () => {
    const res = runFakeAiInterviewTurn({
      ideaId,
      ideaTitle: "AI Logistics Co",
      rawDescription: "Optimizing trucking routes across UAE",
      geography: ["UAE"],
      turnHistory: [
        {
          role: "founder",
          content: "Mid-sized fleet operators",
          extracted: { customer: "Mid-sized fleet operators" },
        },
        {
          role: "assistant",
          content: "What is the problem?",
          extracted: {},
        },
        {
          role: "founder",
          content: "Empty miles and manual dispatching",
          extracted: { problem: "Empty miles" },
        },
        {
          role: "assistant",
          content: "What are the alternatives?",
          extracted: {},
        },
        {
          role: "founder",
          content: "Excel sheets and phone calls",
          extracted: { alternatives: "Excel sheets" },
        },
        {
          role: "assistant",
          content: "What is your business model?",
          extracted: {},
        },
      ],
      founderMessage: "SaaS subscription of $500/month per fleet.",
    });

    expect(res.isComplete).toBe(true);
    expect(res.draftBrief).toBeDefined();
    expect(res.draftBrief?.customer).toBe("Mid-sized fleet operators");
    expect(res.draftBrief?.businessModel).toBe("SaaS subscription of $500/month per fleet.");
    expect(res.draftBrief?.researchQuestions?.length).toBeGreaterThan(0);
  });
});

describe("Interview Module — AI Proxy & Fallback", () => {
  it("falls back to fake AI if AI service throws network error", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    try {
      const result = await queryAiInterviewTurn({
        ideaId,
        ideaTitle: "Test Idea",
        rawDescription: "Test Description",
        geography: ["India"],
        turnHistory: [],
        founderMessage: "Hello",
      });

      expect(result).toBeDefined();
      expect(result.question).toBeDefined();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("uses AI service response when endpoint returns 200", async () => {
    const originalFetch = global.fetch;
    const mockAiResponse = {
      question: "What is your primary revenue model?",
      extracted: { customer: "Founders" },
      isComplete: false,
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockAiResponse,
    } as any);

    try {
      const result = await queryAiInterviewTurn({
        ideaId,
        ideaTitle: "Test Idea",
        rawDescription: "Test Description",
        geography: ["India"],
        turnHistory: [],
        founderMessage: "Hello",
      });

      expect(result.question).toBe("What is your primary revenue model?");
      expect(result.extracted.customer).toBe("Founders");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("Interview Module — HTTP Endpoints Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    poolQuery.mockRestore();
    poolConnect.mockRestore();
  });

  it("returns 401 when request has no bearer token or authentication", async () => {
    await request(createApp())
      .get(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/interview`)
      .expect(401);
  });

  it("returns 403 when user is not a member of the workspace", async () => {
    poolQuery.mockResolvedValueOnce({ rows: [] } as never);
    const token = await createAuthToken();

    await request(createApp())
      .get(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/interview`)
      .set("authorization", `Bearer ${token}`)
      .expect(403);
  });

  it("returns 404 when idea does not exist in workspace", async () => {
    // 1. requireWorkspace membership check
    poolQuery.mockResolvedValueOnce({ rows: [{ role: "owner" }] } as never);
    const token = await createAuthToken();

    // 2. withWorkspace for ideasService.get
    const mockClient = {
      query: vi.fn().mockImplementation((queryText: string) => {
        if (queryText === "BEGIN" || queryText === "COMMIT") return { rows: [] };
        if (queryText.includes("set_config")) return { rows: [] };
        if (queryText.includes("FROM ideas")) return { rows: [] }; // No idea found
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    poolConnect.mockResolvedValueOnce(mockClient as any);

    const res = await request(createApp())
      .get(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/interview`)
      .set("authorization", `Bearer ${token}`)
      .expect(404);

    expect(res.body.error.code).toBe("not_found");
  });

  it("GET /interview returns turns, aggregated variables, and completion status", async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ role: "member" }] } as never);
    const token = await createAuthToken();

    const mockIdea = {
      id: ideaId,
      workspace_id: workspaceId,
      title: "Fintech App",
      raw_description: "Invoice factoring for SMBs in UAE",
      geography: ["UAE"],
      stage: "exploring",
      status: "active",
    };

    const mockTurns = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        idea_id: ideaId,
        turn_index: 0,
        role: "founder",
        content: "We target SMB wholesalers.",
        extracted: JSON.stringify({ customer: "SMB wholesalers" }),
        created_at: new Date().toISOString(),
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        idea_id: ideaId,
        turn_index: 1,
        role: "assistant",
        content: "What is their core problem?",
        extracted: JSON.stringify({ problem: "Cash flow delays" }),
        created_at: new Date().toISOString(),
      },
    ];

    const mockClient = {
      query: vi.fn().mockImplementation((queryText: string) => {
        if (queryText === "BEGIN" || queryText === "COMMIT") return { rows: [] };
        if (queryText.includes("set_config")) return { rows: [] };
        if (queryText.includes("FROM ideas")) return { rows: [mockIdea] };
        if (queryText.includes("FROM interview_turns")) return { rows: mockTurns };
        if (queryText.includes("FROM research_briefs")) return { rows: [] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    poolConnect.mockResolvedValue(mockClient as any);

    const res = await request(createApp())
      .get(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/interview`)
      .set("authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.ideaId).toBe(ideaId);
    expect(res.body.data.turns).toHaveLength(2);
    expect(res.body.data.extractedVariables.customer).toBe("SMB wholesalers");
    expect(res.body.data.extractedVariables.problem).toBe("Cash flow delays");
    expect(res.body.data.latestBrief).toBeNull();
  });

  it("POST /interview/turns validates body and rejects invalid payloads with 422", async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ role: "member" }] } as never);
    const token = await createAuthToken();

    await request(createApp())
      .post(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/interview/turns`)
      .set("authorization", `Bearer ${token}`)
      .send({ content: "" }) // empty string invalid
      .expect(422);
  });

  it("POST /interview/turns creates founder & assistant turns and proxies to AI", async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ role: "owner" }] } as never);
    const token = await createAuthToken();

    const mockIdea = {
      id: ideaId,
      workspace_id: workspaceId,
      title: "Fintech App",
      raw_description: "Invoice factoring for SMBs in UAE",
      geography: ["UAE"],
      stage: "exploring",
      status: "active",
    };

    let insertedTurns: any[] = [];
    const mockClient = {
      query: vi.fn().mockImplementation((queryText: string, params?: any[]) => {
        if (queryText === "BEGIN" || queryText === "COMMIT") return { rows: [] };
        if (queryText.includes("set_config")) return { rows: [] };
        if (queryText.includes("FROM ideas")) return { rows: [mockIdea] };
        if (queryText.includes("FROM interview_turns WHERE")) return { rows: insertedTurns };
        if (queryText.includes("INSERT INTO interview_turns")) {
          const newTurn = {
            id: `turn-${insertedTurns.length + 1}`,
            idea_id: params![0],
            turn_index: params![1],
            role: params![2],
            content: params![3],
            extracted: params![4],
            created_at: new Date().toISOString(),
          };
          insertedTurns.push(newTurn);
          return { rows: [newTurn] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    poolConnect.mockResolvedValue(mockClient as any);

    const res = await request(createApp())
      .post(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/interview/turns`)
      .set("authorization", `Bearer ${token}`)
      .send({ content: "We are building an invoice factoring platform for wholesalers in Dubai." })
      .expect(201);

    expect(res.body.data.founderTurn).toBeDefined();
    expect(res.body.data.founderTurn.role).toBe("founder");
    expect(res.body.data.founderTurn.turnIndex).toBe(0);

    expect(res.body.data.assistantTurn).toBeDefined();
    expect(res.body.data.assistantTurn.role).toBe("assistant");
    expect(res.body.data.assistantTurn.turnIndex).toBe(1);
    expect(res.body.data.assistantTurn.content).toBeTruthy();
  });

  it("POST /interview/finalize persists a versioned research_briefs row", async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ role: "owner" }] } as never);
    const token = await createAuthToken();

    const mockIdea = {
      id: ideaId,
      workspace_id: workspaceId,
      title: "Fintech App",
      raw_description: "Invoice factoring for SMBs in UAE",
      geography: ["UAE"],
      stage: "exploring",
      status: "active",
    };

    const mockClient = {
      query: vi.fn().mockImplementation((queryText: string, params?: any[]) => {
        if (queryText === "BEGIN" || queryText === "COMMIT") return { rows: [] };
        if (queryText.includes("set_config")) return { rows: [] };
        if (queryText.includes("FROM ideas")) return { rows: [mockIdea] };
        if (queryText.includes("FROM interview_turns")) return { rows: [] };
        if (queryText.includes("MAX(version)")) return { rows: [{ next_version: 1 }] };
        if (queryText.includes("INSERT INTO research_briefs")) {
          return {
            rows: [
              {
                id: "33333333-3333-4333-8333-333333333333",
                idea_id: ideaId,
                version: params![1],
                problem: params![2],
                customer: params![3],
                geography: params![4],
                category: params![5],
                alternatives: params![6],
                business_model: params![7],
                differentiation: params![8],
                known_evidence: params![9],
                unknowns: params![10],
                research_questions: params![11],
                created_at: new Date().toISOString(),
              },
            ],
          };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    poolConnect.mockResolvedValue(mockClient as any);

    const res = await request(createApp())
      .post(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/interview/finalize`)
      .set("authorization", `Bearer ${token}`)
      .send({
        problem: "60-day invoice delays choke SMB cash flows",
        customer: "B2B trading businesses in Dubai",
        businessModel: "2% fee per advance",
      })
      .expect(201);

    expect(res.body.data.id).toBe("33333333-3333-4333-8333-333333333333");
    expect(res.body.data.version).toBe(1);
    expect(res.body.data.problem).toBe("60-day invoice delays choke SMB cash flows");
    expect(res.body.data.customer).toBe("B2B trading businesses in Dubai");
    expect(res.body.data.businessModel).toBe("2% fee per advance");
  });

  it("POST /interview/finalize increments version on subsequent finalization", async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ role: "owner" }] } as never);
    const token = await createAuthToken();

    const mockIdea = {
      id: ideaId,
      workspace_id: workspaceId,
      title: "Fintech App",
      raw_description: "Invoice factoring for SMBs in UAE",
      geography: ["UAE"],
      stage: "exploring",
      status: "active",
    };

    const mockClient = {
      query: vi.fn().mockImplementation((queryText: string, params?: any[]) => {
        if (queryText === "BEGIN" || queryText === "COMMIT") return { rows: [] };
        if (queryText.includes("set_config")) return { rows: [] };
        if (queryText.includes("FROM ideas")) return { rows: [mockIdea] };
        if (queryText.includes("FROM interview_turns")) return { rows: [] };
        if (queryText.includes("MAX(version)")) return { rows: [{ next_version: 2 }] };
        if (queryText.includes("INSERT INTO research_briefs")) {
          return {
            rows: [
              {
                id: "44444444-4444-4444-8444-444444444444",
                idea_id: ideaId,
                version: 2,
                problem: params![2],
                customer: params![3],
                geography: params![4],
                category: params![5],
                alternatives: params![6],
                business_model: params![7],
                differentiation: params![8],
                known_evidence: params![9],
                unknowns: params![10],
                research_questions: params![11],
                created_at: new Date().toISOString(),
              },
            ],
          };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    poolConnect.mockResolvedValue(mockClient as any);

    const res = await request(createApp())
      .post(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/interview/finalize`)
      .set("authorization", `Bearer ${token}`)
      .send({
        problem: "Updated problem statement v2",
      })
      .expect(201);

    expect(res.body.data.version).toBe(2);
    expect(res.body.data.problem).toBe("Updated problem statement v2");
  });

  it("GET /interview/brief returns 404 when no brief exists", async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ role: "member" }] } as never);
    const token = await createAuthToken();

    const mockIdea = {
      id: ideaId,
      workspace_id: workspaceId,
      title: "Fintech App",
      raw_description: "Invoice factoring",
      geography: ["UAE"],
      stage: "exploring",
      status: "active",
    };

    const mockClient = {
      query: vi.fn().mockImplementation((queryText: string) => {
        if (queryText === "BEGIN" || queryText === "COMMIT") return { rows: [] };
        if (queryText.includes("set_config")) return { rows: [] };
        if (queryText.includes("FROM ideas")) return { rows: [mockIdea] };
        if (queryText.includes("FROM research_briefs")) return { rows: [] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    poolConnect.mockResolvedValue(mockClient as any);

    const res = await request(createApp())
      .get(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/interview/brief`)
      .set("authorization", `Bearer ${token}`)
      .expect(404);

    expect(res.body.error.code).toBe("brief_not_found");
  });

  it("GET /interview/brief returns latest brief successfully", async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ role: "member" }] } as never);
    const token = await createAuthToken();

    const mockIdea = {
      id: ideaId,
      workspace_id: workspaceId,
      title: "Fintech App",
      raw_description: "Invoice factoring",
      geography: ["UAE"],
      stage: "exploring",
      status: "active",
    };

    const mockBrief = {
      id: "brief-123",
      idea_id: ideaId,
      version: 1,
      problem: "Working capital delays",
      customer: "UAE SMBs",
      geography: ["UAE"],
      category: "Fintech",
      alternatives: "Bank overdrafts",
      business_model: "Subscription + fee",
      differentiation: "Instant AI underwriting",
      known_evidence: JSON.stringify([]),
      unknowns: JSON.stringify([]),
      research_questions: JSON.stringify([]),
      created_at: new Date().toISOString(),
    };

    const mockClient = {
      query: vi.fn().mockImplementation((queryText: string) => {
        if (queryText === "BEGIN" || queryText === "COMMIT") return { rows: [] };
        if (queryText.includes("set_config")) return { rows: [] };
        if (queryText.includes("FROM ideas")) return { rows: [mockIdea] };
        if (queryText.includes("FROM research_briefs")) return { rows: [mockBrief] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    poolConnect.mockResolvedValue(mockClient as any);

    const res = await request(createApp())
      .get(`/v1/workspaces/${workspaceId}/ideas/${ideaId}/interview/brief`)
      .set("authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.id).toBe("brief-123");
    expect(res.body.data.version).toBe(1);
    expect(res.body.data.problem).toBe("Working capital delays");
    expect(res.body.data.customer).toBe("UAE SMBs");
  });
});
