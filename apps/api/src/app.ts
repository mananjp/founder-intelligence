import express from "express";
import helmet from "helmet";
import cors from "cors";
import pinoHttp from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { requestId } from "./middleware/requestId.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requireAuth } from "./middleware/auth.js";
import {
  apiRateLimiter,
  internalRateLimiter,
} from "./middleware/rateLimit.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { internalRouter } from "./modules/internal/internal.routes.js";
import { workspacesRouter } from "./modules/workspaces/workspaces.routes.js";
import { ideasRouter } from "./modules/ideas/ideas.routes.js";
import { researchRouter } from "./modules/research/research.routes.js";
import { docsRouter } from "./openapi/docs.js";

export function buildApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestId);
  app.use(pinoHttp({ logger }));
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "2mb" }));

  // 1. Health endpoints (bypass rate limiting entirely)
  app.use("/health", healthRouter);

  // 2. OpenAPI documentation UI
  app.use("/v1/docs", docsRouter);

  // 3. Internal endpoints tier (higher rate limit: 1200 req/min)
  app.use("/internal", internalRateLimiter, internalRouter);

  // 4. Normal API routes (standard rate limit: 300 req/min, Redis-backed)
  app.use(apiRateLimiter);

  // 5. Authenticated v1 API routes
  const v1 = express.Router();
  v1.use(requireAuth);
  v1.use("/workspaces", workspacesRouter);
  v1.use("/workspaces/:workspaceId/ideas", ideasRouter);
  v1.use("/workspaces/:workspaceId/ideas/:ideaId/research", researchRouter);
  // TODO(modules): interview, evidence, competitors, customers, scorecard, assumptions,
  // experiments, decisions, copilot, radar, reports, billing, notifications
  app.use("/v1", v1);

  app.use(errorHandler);
  return app;
}
