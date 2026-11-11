import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      reporter: ["text", "html", "lcov", "json", "json-summary"],
      // Sprint 2 coverage ratchet — Wk1 non-drop floor (Sprint 1 baseline).
      // Wk3 raises these +10 pts (-> 20/50/35/20) once frontend tests land.
      // Upward-only.
      thresholds: {
        statements: 10,
        branches: 40,
        functions: 25,
        lines: 10,
      },
    },
  },
});
