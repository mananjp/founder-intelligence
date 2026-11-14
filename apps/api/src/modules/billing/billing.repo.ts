import { withWorkspace } from "../../lib/db.js";
import type { SubscriptionType } from "./billing.schema.js";

export const billingRepo = {
  getSubscription: (workspaceId: string): Promise<SubscriptionType | null> =>
    withWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query(
        `SELECT workspace_id AS "workspaceId",
                plan,
                status,
                provider,
                provider_customer_id AS "providerCustomerId",
                current_period_end AS "currentPeriodEnd",
                updated_at AS "updatedAt"
         FROM subscriptions
         WHERE workspace_id = $1`,
        [workspaceId],
      );
      return rows[0] ?? null;
    }),

  countRunsInPeriod: (workspaceId: string, since: Date): Promise<number> =>
    withWorkspace(workspaceId, async (c) => {
      const { rows } = await c.query(
        `SELECT COUNT(*)::int AS count
         FROM research_runs
         WHERE workspace_id = $1
           AND created_at >= $2`,
        [workspaceId, since.toISOString()],
      );
      const rawCount = rows[0]?.count;
      return typeof rawCount === "number" ? rawCount : parseInt(rawCount ?? "0", 10) || 0;
    }),
};

