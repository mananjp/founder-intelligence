import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      reporter: ["text", "html", "lcov", "json"],
      thresholds: {
        statements: 10,
        branches: 40,
        functions: 25,
        lines: 10,
      },
    },
  },
});
