import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { pool } from "./lib/db.js";
import { redis } from "./lib/queue.js";
import { createShutdownHandler } from "./lib/shutdown.js";

const app = buildApp();
const server = app.listen(env.API_PORT, () =>
  logger.info(`api listening on :${env.API_PORT}`),
);

const shutdown = createShutdownHandler(server, { pool, redis });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => void shutdown(sig));
}

