import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";

const app = buildApp();
const server = app.listen(env.API_PORT, () =>
  logger.info(`api listening on :${env.API_PORT}`),
);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
