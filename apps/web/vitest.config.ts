import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      reporter: ["text", "html", "lcov", "json", "json-summary"],
      // Sprint 2 coverage ratchet — Wk3 raise (DoD): Web +10 pts over Sprint 1
      // floors (10/40/25/10 -> 20/50/35/20). Upward-only.
      thresholds: {
        statements: 20,
        branches: 50,
        functions: 35,
        lines: 20,
      },
    },
  },
});
