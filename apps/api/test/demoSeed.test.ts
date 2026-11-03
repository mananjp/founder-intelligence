import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_IDS, runDemoSeed } from "../../../db/seed/demo.js";

const enabled = process.env.RUN_DB_SEED_TESTS === "1";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let rollbackVerified = false;

describe.skipIf(!enabled)("demo seed integration", () => {
  beforeAll(async () => {
    await pool.query(
      "DELETE FROM claim_evidence WHERE claim_id = ANY($1::uuid[]) OR evidence_id = ANY($2::uuid[])",
      [DEMO_IDS.claims, DEMO_IDS.evidence],
    );
    await pool.query("DELETE FROM insights WHERE id = $1", [DEMO_IDS.insight]);
    await pool.query("DELETE FROM opportunity_scores WHERE id = $1", [
      DEMO_IDS.score,
    ]);
    await pool.query("DELETE FROM assumptions WHERE id = ANY($1::uuid[])", [
      DEMO_IDS.assumptions,
    ]);
    await pool.query("DELETE FROM claims WHERE id = ANY($1::uuid[])", [
      DEMO_IDS.claims,
    ]);
    await pool.query("DELETE FROM evidence WHERE id = ANY($1::uuid[])", [
      DEMO_IDS.evidence,
    ]);
    await pool.query("DELETE FROM research_runs WHERE id = $1", [DEMO_IDS.run]);
    await pool.query("DELETE FROM research_briefs WHERE id = $1", [
      DEMO_IDS.brief,
    ]);
    await pool.query("DELETE FROM ideas WHERE id = $1", [DEMO_IDS.idea]);
    await pool.query(
      "DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
      [DEMO_IDS.workspace, DEMO_IDS.user],
    );
    await pool.query("DELETE FROM workspaces WHERE id = $1", [
      DEMO_IDS.workspace,
    ]);
    await pool.query("DELETE FROM users WHERE id = $1", [DEMO_IDS.user]);
    await pool.query(
      "DELETE FROM sources WHERE id = ANY($1::uuid[]) OR url LIKE 'https://demo.founder-intelligence.local/%'",
      [DEMO_IDS.sources],
    );
    const beforeRollback = await pool.query(
      "SELECT (SELECT count(*) FROM users WHERE id = $1) AS users, " +
        "(SELECT count(*) FROM workspaces WHERE id = $2) AS workspaces, " +
        "(SELECT count(*) FROM claims WHERE id = ANY($3::uuid[])) AS claims",
      [DEMO_IDS.user, DEMO_IDS.workspace, DEMO_IDS.claims],
    );
    await expect(runDemoSeed(pool, { failAfter: "claims" })).rejects.toThrow(
      "Intentional seed failure",
    );
    const rolledBack = await pool.query(
      "SELECT (SELECT count(*) FROM users WHERE id = $1) AS users, " +
        "(SELECT count(*) FROM workspaces WHERE id = $2) AS workspaces, " +
        "(SELECT count(*) FROM claims WHERE id = ANY($3::uuid[])) AS claims",
      [DEMO_IDS.user, DEMO_IDS.workspace, DEMO_IDS.claims],
    );
    expect(rolledBack.rows[0]).toEqual(beforeRollback.rows[0]);
    rollbackVerified = true;
    await pool.query(
      "INSERT INTO sources (id, url, content_hash, title, publisher, source_type) VALUES ($1, $2, $3, $4, $5, $6) " +
        "ON CONFLICT (url, content_hash) DO NOTHING",
      [
        "00000000-0000-4000-8000-000000000099",
        "https://demo.founder-intelligence.local/official",
        "demo-source-001",
        "Pre-existing source metadata",
        "Unrelated Publisher",
        "other",
      ],
    );
    await runDemoSeed(pool);
    await runDemoSeed(pool);
  });

  afterAll(() => pool.end());

  it("preserves user edits and creates no duplicates", async () => {
    await pool.query("UPDATE ideas SET title = $1 WHERE id = $2", [
      "User-edited demo title",
      DEMO_IDS.idea,
    ]);
    await pool.query("UPDATE assumptions SET status = $1 WHERE id = $2", [
      "accepted",
      DEMO_IDS.assumptions[0],
    ]);
    await runDemoSeed(pool);

    const rows = await pool.query(
      `SELECT
        (SELECT title FROM ideas WHERE id = $1) AS title,
        (SELECT status FROM assumptions WHERE id = $2) AS assumption_status,
        (SELECT count(*) FROM users WHERE id = $3) AS users,
        (SELECT count(*) FROM workspaces WHERE id = $4) AS workspaces,
        (SELECT count(*) FROM ideas WHERE id = $1) AS ideas,
        (SELECT count(*) FROM research_runs WHERE id = $5) AS runs,
        (SELECT count(*) FROM sources WHERE url LIKE 'https://demo.founder-intelligence.local/%') AS sources,
        (SELECT count(*) FROM evidence WHERE id = ANY($6::uuid[])) AS evidence,
        (SELECT count(*) FROM claims WHERE id = ANY($7::uuid[])) AS claims,
        (SELECT count(*) FROM insights WHERE id = $8) AS insights,
        (SELECT count(*) FROM opportunity_scores WHERE id = $9) AS scores,
        (SELECT count(*) FROM assumptions WHERE id = ANY($10::uuid[])) AS assumptions`,
      [
        DEMO_IDS.idea,
        DEMO_IDS.assumptions[0],
        DEMO_IDS.user,
        DEMO_IDS.workspace,
        DEMO_IDS.run,
        DEMO_IDS.evidence,
        DEMO_IDS.claims,
        DEMO_IDS.insight,
        DEMO_IDS.score,
        DEMO_IDS.assumptions,
      ],
    );
    expect(rows.rows[0]).toMatchObject({
      title: "User-edited demo title",
      assumption_status: "accepted",
      users: "1",
      workspaces: "1",
      ideas: "1",
      runs: "1",
      sources: "3",
      evidence: "5",
      claims: "7",
      insights: "1",
      scores: "1",
      assumptions: "2",
    });
  });

  it("fails on an unexpected workspace membership role without changing it", async () => {
    await pool.query(
      "UPDATE workspace_members SET role = $1 WHERE workspace_id = $2 AND user_id = $3",
      ["viewer", DEMO_IDS.workspace, DEMO_IDS.user],
    );
    await expect(runDemoSeed(pool)).rejects.toThrow(
      `Demo seed deterministic ID collision for workspace membership ${DEMO_IDS.workspace}/${DEMO_IDS.user}`,
    );
    const membership = await pool.query(
      "SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
      [DEMO_IDS.workspace, DEMO_IDS.user],
    );
    expect(membership.rows[0].role).toBe("viewer");
    await pool.query(
      "UPDATE workspace_members SET role = $1 WHERE workspace_id = $2 AND user_id = $3",
      ["owner", DEMO_IDS.workspace, DEMO_IDS.user],
    );
  });

  it("handles existing claim-evidence pairs idempotently and rejects invalid foreign keys", async () => {
    const before = await pool.query(
      "SELECT count(*) FROM claim_evidence WHERE claim_id = $1 AND evidence_id = $2",
      [DEMO_IDS.claims[0], DEMO_IDS.evidence[0]],
    );
    expect(before.rows[0].count).toBe("1");
    await runDemoSeed(pool);
    const after = await pool.query(
      "SELECT count(*) FROM claim_evidence WHERE claim_id = $1 AND evidence_id = $2",
      [DEMO_IDS.claims[0], DEMO_IDS.evidence[0]],
    );
    expect(after.rows[0].count).toBe("1");
    await expect(
      pool.query(
        "INSERT INTO claim_evidence (claim_id, evidence_id) VALUES ($1, $2)",
        [DEMO_IDS.claims[0], "00000000-0000-4000-8000-000000000199"],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("reuses an existing canonical source without overwriting metadata", async () => {
    const source = await pool.query(
      "SELECT id, title, publisher, source_type FROM sources WHERE url = $1 AND content_hash = $2",
      ["https://demo.founder-intelligence.local/official", "demo-source-001"],
    );
    expect(source.rows[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000099",
      title: "Pre-existing source metadata",
      publisher: "Unrelated Publisher",
      source_type: "other",
    });
    const evidence = await pool.query(
      "SELECT e.source_id, s.url FROM evidence e JOIN sources s ON s.id = e.source_id WHERE e.id = $1",
      [DEMO_IDS.evidence[0]],
    );
    expect(evidence.rows[0].source_id).toBe(source.rows[0].id);
    const collisionEvidence = await pool.query(
      "SELECT s.id, s.url FROM evidence e JOIN sources s ON s.id = e.source_id WHERE e.id = $1",
      [DEMO_IDS.evidence[1]],
    );
    expect(collisionEvidence.rows[0].id).toBe(DEMO_IDS.sources[1]);
    expect(collisionEvidence.rows[0].url).toBe(
      "https://demo.founder-intelligence.local/market",
    );
  });

  it("fails safely for deterministic-ID relationship collisions", async () => {
    const alternate = {
      user: "00000000-0000-4000-8000-000000000101",
      workspace: "00000000-0000-4000-8000-000000000102",
      idea: "00000000-0000-4000-8000-000000000103",
      brief: "00000000-0000-4000-8000-000000000104",
      run: "00000000-0000-4000-8000-000000000105",
      source: "00000000-0000-4000-8000-000000000106",
    };
    await pool.query(
      "INSERT INTO users (id, email) VALUES ($1, $2), ($3, $4) ON CONFLICT DO NOTHING",
      [
        alternate.user,
        "collision-user@example.test",
        "00000000-0000-4000-8000-000000000107",
        "second-collision-user@example.test",
      ],
    );
    await pool.query(
      "INSERT INTO workspaces (id, name, owner_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [alternate.workspace, "Collision Workspace", alternate.user],
    );
    await pool.query(
      "INSERT INTO ideas (id, workspace_id, created_by, title, raw_description) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
      [
        alternate.idea,
        alternate.workspace,
        alternate.user,
        "Collision idea",
        "Collision description",
      ],
    );
    await pool.query(
      "INSERT INTO research_briefs (id, idea_id, version) VALUES ($1, $2, 1) ON CONFLICT DO NOTHING",
      [alternate.brief, alternate.idea],
    );
    await pool.query(
      "INSERT INTO research_runs (id, workspace_id, idea_id, brief_id, geography, created_by) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
      [
        alternate.run,
        alternate.workspace,
        alternate.idea,
        alternate.brief,
        ["AE"],
        alternate.user,
      ],
    );
    await pool.query(
      "INSERT INTO sources (id, url, content_hash, source_type) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
      [alternate.source, "https://collision.example", "collision", "other"],
    );

    await pool.query(
      "UPDATE sources SET url = $1, content_hash = $2 WHERE id = $3",
      [
        "https://collision.example/changed",
        "changed",
        "00000000-0000-4000-8000-000000000099",
      ],
    );
    await pool.query(
      "INSERT INTO sources (id, url, content_hash, source_type) VALUES ($1, $2, $3, $4)",
      [
        DEMO_IDS.sources[0],
        "https://collision.example/id",
        "collision-id",
        "other",
      ],
    );
    await expect(runDemoSeed(pool)).rejects.toThrow(
      "Demo seed deterministic ID collision for source",
    );
    await pool.query(
      "UPDATE sources SET url = $1, content_hash = $2 WHERE id = $3",
      [
        "https://demo.founder-intelligence.local/official",
        "demo-source-001",
        "00000000-0000-4000-8000-000000000099",
      ],
    );
    await pool.query("DELETE FROM sources WHERE id = $1", [
      DEMO_IDS.sources[0],
    ]);

    const collisions: Array<{
      label: string;
      update: string;
      params: string[];
      restore: string;
      restoreParams: string[];
    }> = [
      {
        label: "user",
        update: "UPDATE users SET email = $1 WHERE id = $2",
        params: ["unrelated@example.test", DEMO_IDS.user],
        restore: "UPDATE users SET email = $1 WHERE id = $2",
        restoreParams: ["demo@founder-intelligence.local", DEMO_IDS.user],
      },
      {
        label: "workspace",
        update: "UPDATE workspaces SET owner_id = $1 WHERE id = $2",
        params: [alternate.user, DEMO_IDS.workspace],
        restore: "UPDATE workspaces SET owner_id = $1 WHERE id = $2",
        restoreParams: [DEMO_IDS.user, DEMO_IDS.workspace],
      },
      {
        label: "idea",
        update: "UPDATE ideas SET workspace_id = $1 WHERE id = $2",
        params: [alternate.workspace, DEMO_IDS.idea],
        restore: "UPDATE ideas SET workspace_id = $1 WHERE id = $2",
        restoreParams: [DEMO_IDS.workspace, DEMO_IDS.idea],
      },
      {
        label: "research brief",
        update:
          "UPDATE research_briefs SET idea_id = $1, version = $2 WHERE id = $3",
        params: [alternate.idea, "2", DEMO_IDS.brief],
        restore:
          "UPDATE research_briefs SET idea_id = $1, version = $2 WHERE id = $3",
        restoreParams: [DEMO_IDS.idea, "1", DEMO_IDS.brief],
      },
      {
        label: "research run",
        update:
          "UPDATE research_runs SET workspace_id = $1, idea_id = $2, brief_id = $3 WHERE id = $4",
        params: [
          alternate.workspace,
          alternate.idea,
          alternate.brief,
          DEMO_IDS.run,
        ],
        restore:
          "UPDATE research_runs SET workspace_id = $1, idea_id = $2, brief_id = $3 WHERE id = $4",
        restoreParams: [
          DEMO_IDS.workspace,
          DEMO_IDS.idea,
          DEMO_IDS.brief,
          DEMO_IDS.run,
        ],
      },
      {
        label: "evidence",
        update: "UPDATE evidence SET run_id = $1, source_id = $2 WHERE id = $3",
        params: [alternate.run, alternate.source, DEMO_IDS.evidence[0]],
        restore:
          "UPDATE evidence SET run_id = $1, source_id = $2 WHERE id = $3",
        restoreParams: [
          DEMO_IDS.run,
          "00000000-0000-4000-8000-000000000099",
          DEMO_IDS.evidence[0],
        ],
      },
      {
        label: "claim",
        update: "UPDATE claims SET idea_id = $1, run_id = $2 WHERE id = $3",
        params: [alternate.idea, alternate.run, DEMO_IDS.claims[0]],
        restore: "UPDATE claims SET idea_id = $1, run_id = $2 WHERE id = $3",
        restoreParams: [DEMO_IDS.idea, DEMO_IDS.run, DEMO_IDS.claims[0]],
      },
      {
        label: "insight",
        update: "UPDATE insights SET idea_id = $1, run_id = $2 WHERE id = $3",
        params: [alternate.idea, alternate.run, DEMO_IDS.insight],
        restore: "UPDATE insights SET idea_id = $1, run_id = $2 WHERE id = $3",
        restoreParams: [DEMO_IDS.idea, DEMO_IDS.run, DEMO_IDS.insight],
      },
      {
        label: "opportunity score",
        update:
          "UPDATE opportunity_scores SET idea_id = $1, run_id = $2 WHERE id = $3",
        params: [alternate.idea, alternate.run, DEMO_IDS.score],
        restore:
          "UPDATE opportunity_scores SET idea_id = $1, run_id = $2 WHERE id = $3",
        restoreParams: [DEMO_IDS.idea, DEMO_IDS.run, DEMO_IDS.score],
      },
      {
        label: "assumption",
        update: "UPDATE assumptions SET idea_id = $1 WHERE id = $2",
        params: [alternate.idea, DEMO_IDS.assumptions[0]],
        restore: "UPDATE assumptions SET idea_id = $1 WHERE id = $2",
        restoreParams: [DEMO_IDS.idea, DEMO_IDS.assumptions[0]],
      },
    ];

    for (const collision of collisions) {
      try {
        await pool.query(collision.update, collision.params);
        await expect(runDemoSeed(pool)).rejects.toThrow(
          `Demo seed deterministic ID collision for ${collision.label}`,
        );
      } finally {
        await pool.query(collision.restore, collision.restoreParams);
      }
    }

    const unchanged = await pool.query(
      "SELECT (SELECT title FROM ideas WHERE id = $1) AS title, " +
        "(SELECT status FROM assumptions WHERE id = $2) AS status",
      [DEMO_IDS.idea, DEMO_IDS.assumptions[0]],
    );
    expect(unchanged.rows[0]).toEqual({
      title: "User-edited demo title",
      status: "accepted",
    });
  });

  it("validates workspace, run, evidence, and claim relationships", async () => {
    const relationships = await pool.query(
      `SELECT
        (SELECT count(*) FROM ideas WHERE id = $1 AND workspace_id = $2) AS idea,
        (SELECT count(*) FROM research_briefs WHERE id = $3 AND idea_id = $1) AS brief,
        (SELECT count(*) FROM research_runs WHERE id = $4 AND workspace_id = $2 AND idea_id = $1 AND brief_id = $3) AS run,
        (SELECT count(*) FROM evidence e JOIN research_runs r ON r.id = e.run_id JOIN sources s ON s.id = e.source_id WHERE e.id = ANY($5::uuid[]) AND e.run_id = $4 AND r.workspace_id = $2 AND s.id IS NOT NULL) AS evidence,
        (SELECT count(*) FROM claims WHERE id = ANY($6::uuid[]) AND idea_id = $1) AS claims,
        (SELECT count(*) FROM claim_evidence ce JOIN claims c ON c.id = ce.claim_id JOIN evidence e ON e.id = ce.evidence_id WHERE ce.claim_id = ANY($6::uuid[]) AND c.idea_id = $1 AND e.run_id = $4) AS claim_evidence,
        (SELECT count(*) FROM insights WHERE id = $7 AND idea_id = $1 AND run_id = $4) AS insight,
        (SELECT count(*) FROM opportunity_scores WHERE id = $8 AND idea_id = $1 AND run_id = $4) AS score,
        (SELECT count(*) FROM assumptions WHERE id = ANY($9::uuid[]) AND idea_id = $1) AS assumptions`,
      [
        DEMO_IDS.idea,
        DEMO_IDS.workspace,
        DEMO_IDS.brief,
        DEMO_IDS.run,
        DEMO_IDS.evidence,
        DEMO_IDS.claims,
        DEMO_IDS.insight,
        DEMO_IDS.score,
        DEMO_IDS.assumptions,
      ],
    );
    expect(relationships.rows[0]).toEqual({
      idea: "1",
      brief: "1",
      run: "1",
      evidence: "5",
      claims: "7",
      claim_evidence: "6",
      insight: "1",
      score: "1",
      assumptions: "2",
    });
  });

  it("resolves all denormalized claim citations to demo claims", async () => {
    const invalid = await pool.query(
      `WITH cited AS (
        SELECT unnest(i.cited_claim_ids) AS claim_id FROM insights i WHERE i.id = $1
        UNION ALL
        SELECT unnest(a.linked_claim_ids) FROM assumptions a WHERE a.id = ANY($2::uuid[])
        UNION ALL
        SELECT (claim.value #>> '{}')::uuid
        FROM opportunity_scores o, jsonb_each(o.dimension_scores) dimensions(key, dimension)
        CROSS JOIN LATERAL jsonb_array_elements(dimension->'citedClaimIds') claim
        WHERE o.id = $3
      )
      SELECT count(*) FROM cited c LEFT JOIN claims cl ON cl.id = c.claim_id AND cl.idea_id = $4
      WHERE cl.id IS NULL`,
      [DEMO_IDS.insight, DEMO_IDS.assumptions, DEMO_IDS.score, DEMO_IDS.idea],
    );
    expect(invalid.rows[0].count).toBe("0");
  });

  it("rolls back all writes after a mid-seed failure", async () => {
    expect(rollbackVerified).toBe(true);
  });

  it("does not leak app.workspace_id after the transaction", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [
        DEMO_IDS.workspace,
      ]);
      expect(
        (await client.query("SELECT current_setting('app.workspace_id', true)"))
          .rows[0].current_setting,
      ).toBe(DEMO_IDS.workspace);
      await client.query("COMMIT");
      expect(
        (await client.query("SELECT current_setting('app.workspace_id', true)"))
          .rows[0].current_setting,
      ).toBe("");
    } finally {
      client.release();
    }
  });
});
