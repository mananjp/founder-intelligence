import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgres://fi:fi@localhost:5432/fi",
      REDIS_URL: "redis://localhost:6379",
      WEB_ORIGIN: "http://localhost:3000",
      AI_SERVICE_URL: "http://localhost:8000",
      INTERNAL_SERVICE_TOKEN: "test-internal-token-12345",
      SUPABASE_JWT_SECRET: "test-supabase-jwt-secret",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "html", "lcov", "json"],
      thresholds: {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0,
      },
    },
  },
});
