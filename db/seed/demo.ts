import pg from "pg";
import { fileURLToPath } from "node:url";
import path from "node:path";

const { Pool } = pg;

export const DEMO_IDS = {
  user: "00000000-0000-4000-8000-000000000001",
  workspace: "00000000-0000-4000-8000-000000000002",
  idea: "00000000-0000-4000-8000-000000000003",
  brief: "00000000-0000-4000-8000-000000000004",
  run: "00000000-0000-4000-8000-000000000005",
  sources: [
    "00000000-0000-4000-8000-000000000011",
    "00000000-0000-4000-8000-000000000012",
    "00000000-0000-4000-8000-000000000013",
  ],
  evidence: [
    "00000000-0000-4000-8000-000000000021",
    "00000000-0000-4000-8000-000000000022",
    "00000000-0000-4000-8000-000000000023",
    "00000000-0000-4000-8000-000000000024",
    "00000000-0000-4000-8000-000000000025",
  ],
  claims: [
    "00000000-0000-4000-8000-000000000031",
    "00000000-0000-4000-8000-000000000032",
    "00000000-0000-4000-8000-000000000033",
    "00000000-0000-4000-8000-000000000034",
    "00000000-0000-4000-8000-000000000035",
    "00000000-0000-4000-8000-000000000036",
    "00000000-0000-4000-8000-000000000037",
  ],
  insight: "00000000-0000-4000-8000-000000000041",
  score: "00000000-0000-4000-8000-000000000042",
  assumptions: [
    "00000000-0000-4000-8000-000000000051",
    "00000000-0000-4000-8000-000000000052",
  ],
} as const;

const CLAIM_STATUSES = [
  "verified",
  "supported",
  "directional",
  "conflicting",
  "inferred",
  "assumption",
  "unverified",
] as const;

export type DemoSeedOptions = {
  failAfter?: "evidence" | "claims";
};

async function insertOrValidate<T extends pg.QueryResultRow>(
  client: pg.PoolClient,
  entity: string,
  insertSql: string,
  insertParams: unknown[],
  selectSql: string,
  selectParams: unknown[],
  isExpected: (row: T) => boolean,
): Promise<T> {
  const inserted = await client.query<T>(insertSql, insertParams);
  if (inserted.rows[0]) {
    return inserted.rows[0];
  }
  const existing = await client.query<T>(selectSql, selectParams);
  if (!existing.rows[0]) {
    throw new Error(`Demo seed could not resolve ${entity} after conflict`);
  }
  if (!isExpected(existing.rows[0])) {
    throw new Error(`Demo seed deterministic ID collision for ${entity}`);
  }
  return existing.rows[0];
}

export async function runDemoSeed(
  pool: pg.Pool,
  options: DemoSeedOptions = {},
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await insertOrValidate(
      client,
      `user ${DEMO_IDS.user}`,
      "INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3) " +
        "ON CONFLICT (id) DO NOTHING RETURNING id, email",
      [DEMO_IDS.user, "demo@founder-intelligence.local", "Demo Founder"],
      "SELECT id, email FROM users WHERE id = $1",
      [DEMO_IDS.user],
      (row: { email: string }) =>
        row.email === "demo@founder-intelligence.local",
    );
    await insertOrValidate(
      client,
      `workspace ${DEMO_IDS.workspace}`,
      "INSERT INTO workspaces (id, name, owner_id, plan) VALUES ($1, $2, $3, $4) " +
        "ON CONFLICT (id) DO NOTHING RETURNING id, owner_id",
      [DEMO_IDS.workspace, "Demo Workspace", DEMO_IDS.user, "founder"],
      "SELECT id, owner_id FROM workspaces WHERE id = $1",
      [DEMO_IDS.workspace],
      (row: { owner_id: string }) => row.owner_id === DEMO_IDS.user,
    );
    await insertOrValidate(
      client,
      `workspace membership ${DEMO_IDS.workspace}/${DEMO_IDS.user}`,
      "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3) " +
        "ON CONFLICT (workspace_id, user_id) DO NOTHING RETURNING workspace_id, user_id, role",
      [DEMO_IDS.workspace, DEMO_IDS.user, "owner"],
      "SELECT workspace_id, user_id, role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
      [DEMO_IDS.workspace, DEMO_IDS.user],
      (row: { workspace_id: string; user_id: string; role: string }) =>
        row.workspace_id === DEMO_IDS.workspace &&
        row.user_id === DEMO_IDS.user &&
        row.role === "owner",
    );
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [
      DEMO_IDS.workspace,
    ]);

    await insertOrValidate(
      client,
      `idea ${DEMO_IDS.idea}`,
      "INSERT INTO ideas (id, workspace_id, created_by, title, raw_description, category, geography, stage, status) " +
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) " +
        "ON CONFLICT (id) DO NOTHING RETURNING id, workspace_id, created_by",
      [
        DEMO_IDS.idea,
        DEMO_IDS.workspace,
        DEMO_IDS.user,
        "Evidence-backed market intelligence for founders",
        "A workspace that turns scattered market research into traceable claims, assumptions, and decisions.",
        "b2b_saas",
        ["AE", "IN"],
        "validating",
        "active",
      ],
      "SELECT id, workspace_id, created_by FROM ideas WHERE id = $1",
      [DEMO_IDS.idea],
      (row: { workspace_id: string; created_by: string }) =>
        row.workspace_id === DEMO_IDS.workspace &&
        row.created_by === DEMO_IDS.user,
    );
    await insertOrValidate(
      client,
      `research brief ${DEMO_IDS.brief}`,
      "INSERT INTO research_briefs (id, idea_id, version, problem, customer, geography, category, alternatives, business_model, differentiation, known_evidence, unknowns, research_questions) " +
        "VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) " +
        "ON CONFLICT (id) DO NOTHING RETURNING id, idea_id, version",
      [
        DEMO_IDS.brief,
        DEMO_IDS.idea,
        "Founders lack a reliable way to turn research into auditable decisions.",
        "Early-stage founders and small venture teams",
        ["AE", "IN"],
        "b2b_saas",
        "Spreadsheets, bookmarks, generic AI chat, and manual analyst work",
        "Subscription SaaS",
        "Evidence lineage from source to claim to decision",
        JSON.stringify([
          "Founders spend time gathering fragmented market evidence.",
        ]),
        JSON.stringify(["Willingness to pay for continuous research support."]),
        JSON.stringify([
          "How painful is manual evidence synthesis?",
          "Which teams will pay for traceable intelligence?",
        ]),
      ],
      "SELECT id, idea_id, version FROM research_briefs WHERE id = $1",
      [DEMO_IDS.brief],
      (row: { idea_id: string; version: number }) =>
        row.idea_id === DEMO_IDS.idea && row.version === 1,
    );
    await insertOrValidate(
      client,
      `research run ${DEMO_IDS.run}`,
      "INSERT INTO research_runs (id, workspace_id, idea_id, brief_id, depth, geography, state, budget_usd, spent_usd, created_by, completed_at) " +
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, now()) " +
        "ON CONFLICT (id) DO NOTHING RETURNING id, workspace_id, idea_id, brief_id, created_by",
      [
        DEMO_IDS.run,
        DEMO_IDS.workspace,
        DEMO_IDS.idea,
        DEMO_IDS.brief,
        "standard",
        ["AE", "IN"],
        "completed",
        1.5,
        DEMO_IDS.user,
      ],
      "SELECT id, workspace_id, idea_id, brief_id, created_by FROM research_runs WHERE id = $1",
      [DEMO_IDS.run],
      (row: {
        workspace_id: string;
        idea_id: string;
        brief_id: string;
        created_by: string;
      }) =>
        row.workspace_id === DEMO_IDS.workspace &&
        row.idea_id === DEMO_IDS.idea &&
        row.brief_id === DEMO_IDS.brief &&
        row.created_by === DEMO_IDS.user,
    );

    const sources = [
      [
        DEMO_IDS.sources[0],
        "https://demo.founder-intelligence.local/official",
        "Official founder survey summary",
        "Founder Intelligence",
        "official_site",
        "demo-source-001",
      ],
      [
        DEMO_IDS.sources[1],
        "https://demo.founder-intelligence.local/market",
        "Market research overview",
        "Demo Research Group",
        "industry_report",
        "demo-source-002",
      ],
      [
        DEMO_IDS.sources[2],
        "https://demo.founder-intelligence.local/customer",
        "Customer interview notes",
        "Demo Customer Panel",
        "user_upload",
        "demo-source-003",
      ],
    ];
    const resolvedSourceIds: string[] = [];
    for (const [
      id,
      url,
      title,
      publisher,
      sourceType,
      contentHash,
    ] of sources) {
      const existing = await client.query<{ id: string }>(
        "SELECT id FROM sources WHERE url = $1 AND content_hash = $2",
        [url, contentHash],
      );
      if (existing.rows[0]) {
        resolvedSourceIds.push(existing.rows[0].id);
      } else {
        const inserted = await client.query<{
          id: string;
          url: string;
          content_hash: string;
        }>(
          "INSERT INTO sources (id, url, content_hash, title, publisher, source_type) VALUES ($1, $2, $3, $4, $5, $6) " +
            "ON CONFLICT (id) DO NOTHING RETURNING id, url, content_hash",
          [id, url, contentHash, title, publisher, sourceType],
        );
        if (inserted.rows[0]) {
          resolvedSourceIds.push(inserted.rows[0].id);
        } else {
          const collision = await client.query<{
            id: string;
            url: string;
            content_hash: string;
          }>("SELECT id, url, content_hash FROM sources WHERE id = $1", [id]);
          if (
            !collision.rows[0] ||
            collision.rows[0].url !== url ||
            collision.rows[0].content_hash !== contentHash
          ) {
            throw new Error(
              `Demo seed deterministic ID collision for source ${id}`,
            );
          }
          resolvedSourceIds.push(collision.rows[0].id);
        }
      }
    }

    const evidence = [
      [
        DEMO_IDS.evidence[0],
        resolvedSourceIds[0],
        "Founders report losing hours each week to fragmented research.",
        "I lose hours each week reconciling research notes.",
        "supports",
        0.95,
        "fact",
      ],
      [
        DEMO_IDS.evidence[1],
        resolvedSourceIds[1],
        "The market for founder intelligence tools is growing.",
        "The category is expanding as more teams adopt research software.",
        "supports",
        0.8,
        "fact",
      ],
      [
        DEMO_IDS.evidence[2],
        resolvedSourceIds[2],
        "Interviewees disagree on whether research automation is urgent.",
        "Some teams called this urgent, while others preferred existing tools.",
        "contradicts",
        0.85,
        "fact",
      ],
      [
        DEMO_IDS.evidence[3],
        resolvedSourceIds[2],
        "Several interviewees would trial a traceable research workspace.",
        "I would try a workspace that shows exactly where each conclusion came from.",
        "supports",
        0.9,
        "fact",
      ],
      [
        DEMO_IDS.evidence[4],
        resolvedSourceIds[1],
        "Search interest is an early signal, not proof of purchase intent.",
        "Search interest is rising, but purchase intent remains untested.",
        "supports",
        0.7,
        "signal",
      ],
    ];
    for (const [
      id,
      sourceId,
      claimText,
      quote,
      stance,
      relevance,
      kind,
    ] of evidence) {
      await insertOrValidate(
        client,
        `evidence ${id}`,
        "INSERT INTO evidence (id, run_id, source_id, claim_text, quote, stance, relevance, kind) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) " +
          "ON CONFLICT (id) DO NOTHING RETURNING id, run_id, source_id",
        [id, DEMO_IDS.run, sourceId, claimText, quote, stance, relevance, kind],
        "SELECT id, run_id, source_id FROM evidence WHERE id = $1",
        [id],
        (row: { run_id: string; source_id: string }) =>
          row.run_id === DEMO_IDS.run && row.source_id === sourceId,
      );
    }
    if (options.failAfter === "evidence") {
      throw new Error("Intentional seed failure after evidence");
    }

    const claims = [
      [
        "Market pain is confirmed by a primary founder source.",
        "market",
        "evidence",
        "fact",
        "verified",
        DEMO_IDS.evidence[0],
      ],
      [
        "Two independent sources indicate a growing market.",
        "market",
        "evidence",
        "fact",
        "supported",
        `${DEMO_IDS.evidence[0]},${DEMO_IDS.evidence[1]}`,
      ],
      [
        "Rising search interest suggests directional demand.",
        "demand",
        "evidence",
        "signal",
        "directional",
        DEMO_IDS.evidence[4],
      ],
      [
        "Urgency of automation is contested across interviews.",
        "customer",
        "evidence",
        "fact",
        "conflicting",
        `${DEMO_IDS.evidence[2]},${DEMO_IDS.evidence[3]}`,
      ],
      [
        "Traceable research will improve founder decisions.",
        "customer",
        "inferred",
        "fact",
        "inferred",
        "",
      ],
      [
        "Founders will pay for continuous evidence monitoring.",
        "pricing",
        "founder",
        "fact",
        "assumption",
        "",
      ],
      [
        "The initial market can be reached through founder communities.",
        "gtm",
        "evidence",
        "fact",
        "unverified",
        "",
      ],
    ] as const;
    for (let index = 0; index < claims.length; index += 1) {
      const [statement, module, origin, kind, status, evidenceIds] =
        claims[index];
      await insertOrValidate(
        client,
        `claim ${DEMO_IDS.claims[index]}`,
        "INSERT INTO claims (id, idea_id, run_id, statement, module, origin, kind, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) " +
          "ON CONFLICT (id) DO NOTHING RETURNING id, idea_id, run_id",
        [
          DEMO_IDS.claims[index],
          DEMO_IDS.idea,
          DEMO_IDS.run,
          statement,
          module,
          origin,
          kind,
          status,
        ],
        "SELECT id, idea_id, run_id FROM claims WHERE id = $1",
        [DEMO_IDS.claims[index]],
        (row: { idea_id: string; run_id: string }) =>
          row.idea_id === DEMO_IDS.idea && row.run_id === DEMO_IDS.run,
      );
      for (const evidenceId of evidenceIds ? evidenceIds.split(",") : []) {
        await insertOrValidate(
          client,
          `claim-evidence ${DEMO_IDS.claims[index]}/${evidenceId}`,
          "INSERT INTO claim_evidence (claim_id, evidence_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING claim_id, evidence_id",
          [DEMO_IDS.claims[index], evidenceId],
          "SELECT claim_id, evidence_id FROM claim_evidence WHERE claim_id = $1 AND evidence_id = $2",
          [DEMO_IDS.claims[index], evidenceId],
          (row: { claim_id: string; evidence_id: string }) =>
            row.claim_id === DEMO_IDS.claims[index] &&
            row.evidence_id === evidenceId,
        );
      }
    }
    if (
      new Set(claims.map((claim) => claim[4])).size !== CLAIM_STATUSES.length
    ) {
      throw new Error("Demo claims must cover all contract claim statuses");
    }
    if (options.failAfter === "claims") {
      throw new Error("Intentional seed failure after claims");
    }

    await insertOrValidate(
      client,
      `insight ${DEMO_IDS.insight}`,
      "INSERT INTO insights (id, idea_id, run_id, module, summary, cited_claim_ids) VALUES ($1, $2, $3, $4, $5, $6) " +
        "ON CONFLICT (id) DO NOTHING RETURNING id, idea_id, run_id",
      [
        DEMO_IDS.insight,
        DEMO_IDS.idea,
        DEMO_IDS.run,
        "market",
        "The demo evidence shows real research pain and early demand, while willingness to pay remains an explicit assumption.",
        DEMO_IDS.claims.slice(0, 4),
      ],
      "SELECT id, idea_id, run_id FROM insights WHERE id = $1",
      [DEMO_IDS.insight],
      (row: { idea_id: string; run_id: string }) =>
        row.idea_id === DEMO_IDS.idea && row.run_id === DEMO_IDS.run,
    );
    await insertOrValidate(
      client,
      `opportunity score ${DEMO_IDS.score}`,
      "INSERT INTO opportunity_scores (id, idea_id, run_id, dimension_scores, overall_score, evidence_coverage, scoring_model_version) " +
        "VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING RETURNING id, idea_id, run_id",
      [
        DEMO_IDS.score,
        DEMO_IDS.idea,
        DEMO_IDS.run,
        JSON.stringify({
          problem_severity: {
            score: 8,
            evidenceCoverage: 0.9,
            citedClaimIds: [DEMO_IDS.claims[0]],
          },
          market_attractiveness: {
            score: 7,
            evidenceCoverage: 0.7,
            citedClaimIds: [DEMO_IDS.claims[1]],
          },
          customer_willingness: {
            score: 5,
            evidenceCoverage: 0.4,
            citedClaimIds: [DEMO_IDS.claims[5]],
          },
          competitive_pressure: {
            score: 6,
            evidenceCoverage: 0.3,
            citedClaimIds: [],
          },
          differentiation: {
            score: 8,
            evidenceCoverage: 0.8,
            citedClaimIds: [DEMO_IDS.claims[4]],
          },
          timing: {
            score: 7,
            evidenceCoverage: 0.5,
            citedClaimIds: [DEMO_IDS.claims[2]],
          },
          monetization: {
            score: 5,
            evidenceCoverage: 0.2,
            citedClaimIds: [DEMO_IDS.claims[5]],
          },
          distribution_feasibility: {
            score: 6,
            evidenceCoverage: 0.2,
            citedClaimIds: [DEMO_IDS.claims[6]],
          },
          defensibility: { score: 5, evidenceCoverage: 0.2, citedClaimIds: [] },
          execution_fit: {
            score: 7,
            evidenceCoverage: 0.3,
            citedClaimIds: [DEMO_IDS.claims[4]],
          },
        }),
        6.4,
        0.45,
        "opportunity-score.v1",
      ],
      "SELECT id, idea_id, run_id FROM opportunity_scores WHERE id = $1",
      [DEMO_IDS.score],
      (row: { idea_id: string; run_id: string }) =>
        row.idea_id === DEMO_IDS.idea && row.run_id === DEMO_IDS.run,
    );
    const assumptions = [
      [
        DEMO_IDS.assumptions[0],
        "customer",
        "Founders will trust a research workspace when every conclusion has source lineage.",
        "high",
        "testing",
        [DEMO_IDS.claims[0], DEMO_IDS.claims[4]],
      ],
      [
        DEMO_IDS.assumptions[1],
        "wtp",
        "Small venture teams will pay for continuous evidence monitoring.",
        "critical",
        "unverified",
        [DEMO_IDS.claims[5]],
      ],
    ] as const;
    for (const [
      id,
      type,
      statement,
      importance,
      status,
      linkedClaimIds,
    ] of assumptions) {
      await insertOrValidate(
        client,
        `assumption ${id}`,
        "INSERT INTO assumptions (id, idea_id, type, statement, importance, status, linked_claim_ids) VALUES ($1, $2, $3, $4, $5, $6, $7) " +
          "ON CONFLICT (id) DO NOTHING RETURNING id, idea_id",
        [
          id,
          DEMO_IDS.idea,
          type,
          statement,
          importance,
          status,
          linkedClaimIds,
        ],
        "SELECT id, idea_id FROM assumptions WHERE id = $1",
        [id],
        (row: { idea_id: string }) => row.idea_id === DEMO_IDS.idea,
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  runDemoSeed(pool)
    .then(() => {
      console.log("Demo workspace seed complete.");
    })
    .catch((error: unknown) => {
      console.error("Demo workspace seed failed.", error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
