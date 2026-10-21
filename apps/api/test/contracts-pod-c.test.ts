import { describe, it, expect } from "vitest";
import { WatchItem, Alert } from "@fi/contracts";

describe("Pod C Contract Tests — Radar & Monitoring", () => {
  it("validates WatchItem contract schema", () => {
    const validWatch = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ideaId: "11111111-1111-4111-8111-111111111111",
      kind: "competitor",
      target: "https://competitor.io/pricing",
      frequencyHours: 24,
      lastCheckedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const parsed = WatchItem.parse(validWatch);
    expect(parsed.kind).toBe("competitor");
    expect(parsed.frequencyHours).toBe(24);
  });

  it("validates Alert contract schema", () => {
    const validAlert = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ideaId: "11111111-1111-4111-8111-111111111111",
      watchItemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      whatChanged: "Competitor increased starter pricing from $29 to $49/mo.",
      whyItMatters: "Opens up a low-end market opportunity for FI.",
      suggestedAction: "Launch price-sensitivity experiment on $29 price point.",
      citedClaimIds: ["22222222-2222-4222-8222-222222222222"],
      severity: "notable",
      createdAt: new Date().toISOString(),
    };

    const parsed = Alert.parse(validAlert);
    expect(parsed.severity).toBe("notable");
    expect(parsed.whatChanged).toContain("Competitor increased");
  });
});
