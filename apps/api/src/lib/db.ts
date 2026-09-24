import pg from "pg";
import { env } from "../config/env.js";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
});

/** Run a query scoped to a workspace. Sets app.workspace_id so RLS policies (defense in depth) apply. */
export async function withWorkspace<T>(
  workspaceId: string,
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [
      workspaceId,
    ]);
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
