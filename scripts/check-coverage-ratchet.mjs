#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

/**
 * Founder Intelligence — Coverage Ratchet & Non-Drop Guard
 * Sprint 2 Platform / DevOps (Task #9: Rahil Barchha) — Wk1 deliverable.
 *
 * Enforces:
 * 1. Non-Drop Guard: PR coverage must satisfy or exceed the current floors.
 * 2. Upward-Only Policy: thresholds declared in config files cannot be lowered.
 *
 * Floors below mirror the current per-package config thresholds (Sprint 1
 * baseline). The Wk3 "raise" PR bumps both these floors and the configs to the
 * DoD targets (API >= 80%, Web +10 pts, AI/Scoring >= 85%) once module tests
 * land. Only ever raise a floor here; never lower one.
 */

// Current ratchet floors (Upward-Only Policy)
const RATCHET_FLOORS = {
  "@fi/api": {
    name: "apps/api",
    configPath: path.resolve("apps/api/vitest.config.ts"),
    summaryPath: path.resolve("apps/api/coverage/coverage-summary.json"),
    thresholds: { statements: 70, branches: 70, functions: 60, lines: 70 },
  },
  "@fi/web": {
    name: "apps/web",
    configPath: path.resolve("apps/web/vitest.config.ts"),
    summaryPath: path.resolve("apps/web/coverage/coverage-summary.json"),
    thresholds: { statements: 10, branches: 40, functions: 25, lines: 10 },
  },
  "@fi/scoring": {
    name: "packages/scoring",
    configPath: path.resolve("packages/scoring/vitest.config.ts"),
    summaryPath: path.resolve("packages/scoring/coverage/coverage-summary.json"),
    thresholds: { statements: 85, branches: 85, functions: 85, lines: 85 },
  },
};

const PYTHON_AI_FLOOR = {
  name: "apps/ai",
  pyprojectPath: path.resolve("apps/ai/pyproject.toml"),
  minFailUnder: 85,
};

let hasFailure = false;

console.log("================================================================================");
console.log("          FOUNDER INTELLIGENCE — COVERAGE RATCHET & NON-DROP GUARD              ");
console.log("                       Sprint 2 Upward-Only Policy                              ");
console.log("================================================================================\n");

// 1. Guard Config Thresholds (Upward-Only Policy Verification)
console.log("--- Step 1: Upward-Only Policy Configuration Audit ---");
for (const [pkgName, pkg] of Object.entries(RATCHET_FLOORS)) {
  if (!fs.existsSync(pkg.configPath)) {
    console.error(`  [FAIL] Missing config file: ${pkg.configPath}`);
    hasFailure = true;
    continue;
  }

  const content = fs.readFileSync(pkg.configPath, "utf-8");
  for (const [metric, minRequired] of Object.entries(pkg.thresholds)) {
    const regex = new RegExp(`${metric}:\\s*([0-9]+)`);
    const match = content.match(regex);
    if (!match) {
      console.error(`  [FAIL] ${pkgName}: threshold '${metric}' not found in ${pkg.configPath}`);
      hasFailure = true;
      continue;
    }

    const configuredVal = Number.parseInt(match[1], 10);
    if (configuredVal < minRequired) {
      console.error(
        `  [FAIL] Upward-only violation in ${pkgName}: '${metric}' is ${configuredVal}%, must be >= ${minRequired}%`
      );
      hasFailure = true;
    } else {
      console.log(`  ✓ ${pkgName.padEnd(14)} config '${metric}': ${configuredVal}% (required: >=${minRequired}%)`);
    }
  }
}

// Check Python pyproject.toml
if (fs.existsSync(PYTHON_AI_FLOOR.pyprojectPath)) {
  const content = fs.readFileSync(PYTHON_AI_FLOOR.pyprojectPath, "utf-8");
  const match = content.match(/--cov-fail-under=(\d+)/);
  if (match) {
    const failUnder = Number.parseInt(match[1], 10);
    if (failUnder < PYTHON_AI_FLOOR.minFailUnder) {
      console.error(
        `  [FAIL] Upward-only violation in fi-ai: --cov-fail-under is ${failUnder}%, must be >= ${PYTHON_AI_FLOOR.minFailUnder}%`
      );
      hasFailure = true;
    } else {
      console.log(`  ✓ apps/ai        config '--cov-fail-under': ${failUnder}% (required: >=${PYTHON_AI_FLOOR.minFailUnder}%)`);
    }
  } else {
    console.error("  [FAIL] apps/ai: --cov-fail-under not found in pyproject.toml");
    hasFailure = true;
  }
} else {
  console.error(`  [FAIL] apps/ai: pyproject.toml not found at ${PYTHON_AI_FLOOR.pyprojectPath}`);
  hasFailure = true;
}

console.log("\n--- Step 2: Per-PR Non-Drop Coverage Summary Check ---");

for (const [pkgName, pkg] of Object.entries(RATCHET_FLOORS)) {
  console.log(`\nChecking [${pkgName}] (${pkg.name})...`);

  if (!fs.existsSync(pkg.summaryPath)) {
    console.warn(`  [INFO] Coverage summary not yet generated at: ${pkg.summaryPath}`);
    console.warn(`         (Generated in CI after test run)`);
    continue;
  }

  try {
    const summary = JSON.parse(fs.readFileSync(pkg.summaryPath, "utf-8"));
    const total = summary.total;

    for (const [metric, minRequired] of Object.entries(pkg.thresholds)) {
      const actual = total[metric]?.pct ?? 0;
      const passed = actual >= minRequired;
      const statusSymbol = passed ? "✓ PASS" : "✗ FAIL";

      console.log(
        `  ${statusSymbol.padEnd(8)} ${metric.padEnd(12)} Actual: ${actual.toFixed(1).padStart(5)}% | Floor: ${minRequired.toFixed(1)}%`
      );

      if (!passed) {
        hasFailure = true;
      }
    }
  } catch (err) {
    console.error(`  [ERROR] Failed to parse ${pkg.summaryPath}: ${err.message}`);
    hasFailure = true;
  }
}

console.log("\n================================================================================");
if (hasFailure) {
  console.error("❌ FAILED: Coverage non-drop guard detected a regression below required floors!");
  console.error("Policy: Upward-only. PRs cannot reduce coverage thresholds or drop test coverage.");
  process.exit(1);
} else {
  console.log("✅ PASSED: All coverage ratchet floors and upward-only policies satisfied.");
  process.exit(0);
}
