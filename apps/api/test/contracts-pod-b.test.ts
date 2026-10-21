import { describe, it, expect } from "vitest";
import { Report, Subscription, ActivityLog } from "@fi/contracts";

describe("Pod B Contract Tests — Reports, Billing & Workspace", () => {
  it("validates Report contract schema", () => {
    const validReport = {
      id: "88888888-8888-4888-8888-888888888888",
      ideaId: "11111111-1111-4111-8111-111111111111",
      kind: "standard",
      sections: {
        executive_summary: "Strong market pull with 4 major competitor vulnerabilities.",
        tam_breakdown: { tam: "$4.2B", sam: "$820M" },
      },
      exportUri: "https://storage.founder-intelligence.com/reports/r1.pdf",
      version: 1,
      createdAt: new Date().toISOString(),
    };

    const parsed = Report.parse(validReport);
    expect(parsed.kind).toBe("standard");
    expect(parsed.version).toBe(1);
  });

  it("validates Subscription contract schema", () => {
    const validSubscription = {
      workspaceId: "99999999-9999-4999-8999-999999999999",
      plan: "pro",
      status: "active",
      provider: "stripe",
      providerCustomerId: "cus_123456789",
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = Subscription.parse(validSubscription);
    expect(parsed.plan).toBe("pro");
    expect(parsed.status).toBe("active");
  });

  it("validates ActivityLog contract schema", () => {
    const validLog = {
      id: "1001",
      workspaceId: "99999999-9999-4999-8999-999999999999",
      userId: "77777777-7777-4777-8777-777777777777",
      action: "idea.created",
      entityType: "idea",
      entityId: "11111111-1111-4111-8111-111111111111",
      metadata: { source: "web_wizard" },
      createdAt: new Date().toISOString(),
    };

    const parsed = ActivityLog.parse(validLog);
    expect(parsed.action).toBe("idea.created");
    expect(parsed.entityType).toBe("idea");
  });
});
