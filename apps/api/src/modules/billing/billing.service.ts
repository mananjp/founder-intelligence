import {
  PLAN_TIERS,
  type SubscriptionPlanType,
  type WorkspaceUsageType,
} from "./billing.schema.js";
import type { ResearchDepth } from "@fi/contracts";
import { HttpError } from "../../middleware/errorHandler.js";
import { billingRepo } from "./billing.repo.js";

function getStartOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

export const billingService = {
  async getSubscription(workspaceId: string) {
    return billingRepo.getSubscription(workspaceId);
  },

  async getUsage(workspaceId: string): Promise<WorkspaceUsageType> {
    const sub = await billingRepo.getSubscription(workspaceId);
    const plan: SubscriptionPlanType =
      sub && (sub.status === "active" || sub.status === "trialing")
        ? sub.plan
        : "free";

    const tier = PLAN_TIERS[plan] ?? PLAN_TIERS.free;
    const periodStart = getStartOfCurrentMonth();
    const runsUsed = await billingRepo.countRunsInPeriod(workspaceId, periodStart);

    return {
      workspaceId,
      plan,
      status: sub?.status ?? "active",
      runsUsed,
      runsLimit: tier.runsPerMonth,
      allowedDepths: tier.allowedDepths,
      periodStart: periodStart.toISOString(),
      periodEnd: sub?.currentPeriodEnd,
    };
  },

  async assertCanStartRun(
    workspaceId: string,
    depth: ResearchDepth = "quick",
  ): Promise<void> {
    const usage = await this.getUsage(workspaceId);
    const tier = PLAN_TIERS[usage.plan] ?? PLAN_TIERS.free;

    if (!tier.allowedDepths.includes(depth)) {
      throw new HttpError(
        403,
        "PLAN_LIMIT",
        `Research depth '${depth}' is not allowed on the '${usage.plan}' plan. Allowed depths: ${tier.allowedDepths.join(", ")}.`,
        {
          plan: usage.plan,
          allowedDepths: tier.allowedDepths,
          requestedDepth: depth,
        },
      );
    }

    if (usage.runsUsed >= tier.runsPerMonth) {
      throw new HttpError(
        403,
        "PLAN_LIMIT",
        `Monthly research run limit reached (${usage.runsUsed}/${tier.runsPerMonth}) for the '${usage.plan}' plan. Please upgrade to start more runs.`,
        {
          plan: usage.plan,
          runsLimit: tier.runsPerMonth,
          runsUsed: usage.runsUsed,
        },
      );
    }
  },
};

