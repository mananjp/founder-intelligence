import {
  CreateIdea,
  FinalizeInterviewBriefBody,
  InterviewSessionState,
  InterviewTurn,
  InterviewTurnRole,
  PostInterviewTurnBody,
  PostInterviewTurnResponse,
  ResearchBrief,
  ResearchDepth,
  RunEvent,
  RunState,
  StartResearchRun,
} from "@fi/contracts";
import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

const contractSchemas = [
  CreateIdea,
  ResearchDepth,
  RunState,
  StartResearchRun,
  InterviewTurnRole,
  InterviewTurn,
  PostInterviewTurnBody,
  PostInterviewTurnResponse,
  ResearchBrief,
  FinalizeInterviewBriefBody,
  InterviewSessionState,
];
for (const schema of contractSchemas) {
  const proto = Object.getPrototypeOf(schema);
  if (proto && !proto.openapi) {
    proto.openapi = (z.ZodType.prototype as any).openapi;
  }
  if (!(schema as any).openapi) {
    (schema as any).openapi = (z.ZodType.prototype as any).openapi;
  }
}

const registry = new OpenAPIRegistry();

const createIdeaSchema = registry.register("CreateIdea", CreateIdea);
const researchDepthSchema = registry.register("ResearchDepth", ResearchDepth);
const runStateSchema = registry.register("RunState", RunState);
const startResearchRunSchema = registry.register(
  "StartResearchRun",
  StartResearchRun,
);
const runEventSchema = registry.register("RunEvent", RunEvent);
const interviewTurnRoleSchema = registry.register(
  "InterviewTurnRole",
  InterviewTurnRole,
);
const interviewTurnSchema = registry.register(
  "InterviewTurn",
  InterviewTurn,
);
const postInterviewTurnBodySchema = registry.register(
  "PostInterviewTurnBody",
  PostInterviewTurnBody,
);
const researchBriefSchema = registry.register(
  "ResearchBrief",
  ResearchBrief,
);
const finalizeInterviewBriefBodySchema = registry.register(
  "FinalizeInterviewBriefBody",
  FinalizeInterviewBriefBody,
);
const interviewSessionStateSchema = registry.register(
  "InterviewSessionState",
  InterviewSessionState,
);
const postInterviewTurnResponseSchema = registry.register(
  "PostInterviewTurnResponse",
  PostInterviewTurnResponse,
);

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: "Supabase JWT sent in the Authorization header as a Bearer token.",
});

const workspaceParams = z.object({ workspaceId: z.string() });
const ideaParams = workspaceParams.extend({ ideaId: z.string() });
const runParams = ideaParams.extend({ runId: z.string() });

const workspaceItemSchema = registry.register(
  "WorkspaceItem",
  z.object({
    id: z.string().uuid(),
    name: z.string(),
    role: z.string(),
  }),
);
const workspaceCreatedSchema = registry.register(
  "WorkspaceCreated",
  z.object({ id: z.string().uuid(), name: z.string() }),
);
const ideaRecordSchema = registry.register(
  "IdeaRecord",
  z.object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    created_by: z.string().uuid(),
    title: z.string(),
    raw_description: z.string(),
    category: z.string().nullable(),
    geography: z.array(z.string()),
    stage: z.enum(["exploring", "validating", "building", "live"]),
    status: z.string(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  }),
);
const researchRunSchema = registry.register(
  "ResearchRun",
  z.object({
    id: z.string().uuid(),
    state: runStateSchema,
    depth: researchDepthSchema,
  }),
);

const workspaceListResponse = registry.register(
  "WorkspaceListResponse",
  z.object({ data: z.array(workspaceItemSchema) }),
);
const workspaceCreatedResponse = registry.register(
  "WorkspaceCreatedResponse",
  z.object({ data: workspaceCreatedSchema }),
);
const ideaListResponse = registry.register(
  "IdeaListResponse",
  z.object({ data: z.array(ideaRecordSchema) }),
);
const ideaResponse = registry.register(
  "IdeaResponse",
  z.object({ data: ideaRecordSchema }),
);
const researchRunResponse = registry.register(
  "ResearchRunResponse",
  z.object({ data: researchRunSchema }),
);
const healthResponse = registry.register(
  "HealthResponse",
  z.object({ status: z.literal("ok") }),
);
const readinessResponse = registry.register(
  "ReadinessResponse",
  z.object({
    status: z.enum(["ready", "degraded"]),
    checks: z.object({ db: z.boolean(), redis: z.boolean() }),
  }),
);

const interviewStateResponse = registry.register(
  "InterviewStateResponse",
  z.object({ data: interviewSessionStateSchema }),
);
const postInterviewTurnDataResponse = registry.register(
  "PostInterviewTurnDataResponse",
  z.object({ data: postInterviewTurnResponseSchema }),
);
const researchBriefResponse = registry.register(
  "ResearchBriefResponse",
  z.object({ data: researchBriefSchema }),
);

const jsonContent = (schema: z.ZodTypeAny) => ({
  "application/json": { schema },
});
const bearerSecurity = [{ bearerAuth: [] }];

registry.registerPath({
  method: "get",
  path: "/health",
  operationId: "getHealth",
  summary: "Get API health",
  description: "Returns the API process health status. This endpoint is public.",
  tags: ["Health"],
  responses: {
    200: { description: "API is healthy.", content: jsonContent(healthResponse) },
  },
});

registry.registerPath({
  method: "get",
  path: "/health/ready",
  operationId: "getReadiness",
  summary: "Check API dependencies",
  description: "Checks PostgreSQL and Redis readiness. This endpoint is public.",
  tags: ["Health"],
  responses: {
    200: {
      description: "API and dependencies are ready.",
      content: jsonContent(readinessResponse),
    },
    503: {
      description: "One or more dependencies are unavailable.",
      content: jsonContent(readinessResponse),
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/workspaces",
  operationId: "listWorkspaces",
  summary: "List workspaces",
  description: "Lists workspaces available to the authenticated user.",
  tags: ["Workspaces"],
  security: bearerSecurity,
  responses: {
    200: {
      description: "The user's workspaces.",
      content: jsonContent(workspaceListResponse),
    },
    401: { description: "Missing or invalid bearer token." },
  },
});

registry.registerPath({
  method: "post",
  path: "/v1/workspaces",
  operationId: "createWorkspace",
  summary: "Create a workspace",
  description: "Creates a workspace owned by the authenticated user.",
  tags: ["Workspaces"],
  security: bearerSecurity,
  request: {
    body: {
      description: "Workspace name; omitted names use the API default.",
      content: {
        "application/json": {
          schema: z.object({ name: z.string().max(120).optional() }),
        },
      },
    },
  },
  responses: {
    201: {
      description: "Workspace created.",
      content: jsonContent(workspaceCreatedResponse),
    },
    401: { description: "Missing or invalid bearer token." },
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/workspaces/{workspaceId}/ideas",
  operationId: "listIdeas",
  summary: "List workspace ideas",
  description: "Lists ideas in a workspace the authenticated user belongs to.",
  tags: ["Ideas"],
  security: bearerSecurity,
  request: { params: workspaceParams },
  responses: {
    200: {
      description: "The workspace's ideas.",
      content: jsonContent(ideaListResponse),
    },
    401: { description: "Missing or invalid bearer token." },
    403: { description: "The user is not a workspace member." },
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/workspaces/{workspaceId}/ideas/{ideaId}",
  operationId: "getIdea",
  summary: "Get a workspace idea",
  description: "Returns an idea from the specified workspace.",
  tags: ["Ideas"],
  security: bearerSecurity,
  request: { params: ideaParams },
  responses: {
    200: {
      description: "The requested idea.",
      content: jsonContent(ideaResponse),
    },
    401: { description: "Missing or invalid bearer token." },
    403: { description: "The user is not a workspace member." },
    404: { description: "The idea does not exist in this workspace." },
  },
});

registry.registerPath({
  method: "post",
  path: "/v1/workspaces/{workspaceId}/ideas",
  operationId: "createIdea",
  summary: "Create a workspace idea",
  description: "Creates an idea using the shared CreateIdea contract.",
  tags: ["Ideas"],
  security: bearerSecurity,
  request: {
    params: workspaceParams,
    body: {
      required: true,
      content: { "application/json": { schema: createIdeaSchema } },
    },
  },
  responses: {
    201: {
      description: "Idea created.",
      content: jsonContent(ideaResponse),
    },
    401: { description: "Missing or invalid bearer token." },
    403: { description: "The user is not a workspace member." },
    422: { description: "The request body failed validation." },
  },
});

registry.registerPath({
  method: "post",
  path: "/v1/workspaces/{workspaceId}/ideas/{ideaId}/research/runs",
  operationId: "startResearchRun",
  summary: "Start a research run",
  description: "Queues a research run for an idea in the workspace.",
  tags: ["Research"],
  security: bearerSecurity,
  request: {
    params: ideaParams,
    body: {
      required: true,
      content: { "application/json": { schema: startResearchRunSchema } },
    },
  },
  responses: {
    202: {
      description: "Research run accepted.",
      content: jsonContent(researchRunResponse),
    },
    401: { description: "Missing or invalid bearer token." },
    403: { description: "The user is not a workspace member." },
    409: { description: "The idea has no research brief yet." },
    422: { description: "The request body failed validation." },
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/workspaces/{workspaceId}/ideas/{ideaId}/research/runs/{runId}/events",
  operationId: "streamResearchRunEvents",
  summary: "Stream research run events",
  description:
    "Streams Server-Sent Events. Each data frame contains a RunEvent contract value; keep-alive comment frames may also be sent.",
  tags: ["Research"],
  security: bearerSecurity,
  request: { params: runParams },
  responses: {
    200: {
      description: "Server-Sent Event stream for the research run.",
      content: {
        "text/event-stream": {
          schema: z.string().openapi({
            description:
              "SSE wire stream. Each data frame contains JSON matching the RunEvent schema at #/components/schemas/RunEvent; keep-alive frames are comments.",
            example: 'data: {"type":"stage.started","stage":"scoping"}\n\n',
          }),
        },
      },
    },
    401: { description: "Missing or invalid bearer token." },
    403: { description: "The user is not a workspace member." },
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/workspaces/{workspaceId}/ideas/{ideaId}/interview",
  operationId: "getInterviewState",
  summary: "Get adaptive interview state",
  description:
    "Returns the current turns, resolved variables, and brief preview for the idea.",
  tags: ["Interview"],
  security: bearerSecurity,
  request: { params: ideaParams },
  responses: {
    200: {
      description: "Current interview state.",
      content: jsonContent(interviewStateResponse),
    },
    401: { description: "Missing or invalid bearer token." },
    403: { description: "The user is not a workspace member." },
    404: { description: "The idea does not exist in this workspace." },
  },
});

registry.registerPath({
  method: "post",
  path: "/v1/workspaces/{workspaceId}/ideas/{ideaId}/interview/turns",
  operationId: "postInterviewTurn",
  summary: "Submit an interview turn",
  description:
    "Submits founder input, proxies to adaptive AI reasoning, and persists both turns.",
  tags: ["Interview"],
  security: bearerSecurity,
  request: {
    params: ideaParams,
    body: {
      required: true,
      content: { "application/json": { schema: postInterviewTurnBodySchema } },
    },
  },
  responses: {
    201: {
      description:
        "Interview turn processed and assistant response generated.",
      content: jsonContent(postInterviewTurnDataResponse),
    },
    401: { description: "Missing or invalid bearer token." },
    403: { description: "The user is not a workspace member." },
    404: { description: "The idea does not exist in this workspace." },
    422: { description: "The request body failed validation." },
  },
});

registry.registerPath({
  method: "post",
  path: "/v1/workspaces/{workspaceId}/ideas/{ideaId}/interview/finalize",
  operationId: "finalizeInterviewBrief",
  summary: "Finalize research brief",
  description:
    "Confirms and finalizes the interview into an incremented, versioned research brief row.",
  tags: ["Interview"],
  security: bearerSecurity,
  request: {
    params: ideaParams,
    body: {
      required: false,
      content: {
        "application/json": { schema: finalizeInterviewBriefBodySchema },
      },
    },
  },
  responses: {
    201: {
      description: "Versioned research brief successfully created.",
      content: jsonContent(researchBriefResponse),
    },
    401: { description: "Missing or invalid bearer token." },
    403: { description: "The user is not a workspace member." },
    404: { description: "The idea does not exist in this workspace." },
    422: { description: "The request body failed validation." },
  },
});

registry.registerPath({
  method: "get",
  path: "/v1/workspaces/{workspaceId}/ideas/{ideaId}/interview/brief",
  operationId: "getLatestInterviewBrief",
  summary: "Get latest research brief",
  description: "Returns the latest versioned research brief for the idea.",
  tags: ["Interview"],
  security: bearerSecurity,
  request: { params: ideaParams },
  responses: {
    200: {
      description: "The latest research brief.",
      content: jsonContent(researchBriefResponse),
    },
    401: { description: "Missing or invalid bearer token." },
    403: { description: "The user is not a workspace member." },
    404: { description: "No research brief exists for this idea." },
  },
});

export const openApiDocument = new OpenApiGeneratorV31(
  registry.definitions,
).generateDocument({
  openapi: "3.1.0",
  info: {
    title: "Founder Intelligence API",
    version: "0.1.0",
    description:
      "API for founder workspaces, ideas, and research runs. Bearer authentication is required for /v1 endpoints except for the public documentation UI.",
  },
});