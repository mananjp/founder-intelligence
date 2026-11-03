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
      reporter: ["text", "html", "lcov", "json", "json-summary"],
      // Sprint 2 coverage ratchet — Wk1 non-drop floor (Sprint 1 baseline).
      // Wk3 raises these to API >= 80% once module tests land. Upward-only.
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 60,
        lines: 70,
      },
    },
  },
});
