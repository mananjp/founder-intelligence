import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Competitor, CompetitorDetail } from "@fi/contracts";
import { CompetitorsMatrix } from "../src/components/CompetitorsMatrix";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const ideaId = "00000000-0000-4000-8000-000000000002";
const nowIso = "2026-11-26T00:00:00.000Z";

const sampleCompetitors: Competitor[] = [
  {
    id: "00000000-0000-4000-8000-000000000011",
    workspaceId,
    ideaId,
    name: "Rival AI",
    website: "https://rival.example.com",
    kind: "direct",
    description: "AI research tool",
    metadata: {
      positioning: "Automated pitch-deck validator",
      pricing: "$49/mo",
      strengths: ["Fast onboarding"],
      weaknesses: ["No source citations"],
      claimIds: ["00000000-0000-4000-8000-000000000031"],
    },
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: "00000000-0000-4000-8000-000000000012",
    workspaceId,
    ideaId,
    name: "Manual Spreadsheets",
    website: null,
    kind: "internal_diy",
    description: "Founder notes in Excel",
    metadata: { pricing: "Free" },
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

const sampleDetail: CompetitorDetail = {
  ...sampleCompetitors[0],
  linkedClaims: [
    {
      id: "00000000-0000-4000-8000-000000000031",
      ideaId,
      statement: "Rival AI charges $49/mo on its public pricing page.",
      module: "competitive",
      status: "verified",
      evidenceIds: ["00000000-0000-4000-8000-000000000041"],
    },
  ],
};

const baseProps = {
  workspaceId,
  ideaId,
  competitors: [] as Competitor[],
  loading: false,
  error: null as string | null,
  selectedClass: "all" as const,
  onSelectClass: () => {},
  onRetry: () => {},
  selectedCompetitorId: null as string | null,
  detail: null as CompetitorDetail | null,
  detailLoading: false,
  detailError: null as string | null,
  onInspectCompetitor: () => {},
};

describe("CompetitorsMatrix", () => {
  it("renders loading state", () => {
    const html = renderToStaticMarkup(
      <CompetitorsMatrix {...baseProps} loading={true} />,
    );
    expect(html).toContain("Loading competitors matrix...");
    expect(html).toContain('role="status"');
  });

  it("renders error state with retry affordance", () => {
    const html = renderToStaticMarkup(
      <CompetitorsMatrix {...baseProps} error="Network timeout" />,
    );
    expect(html).toContain("Competitors unavailable");
    expect(html).toContain("Network timeout");
    expect(html).toContain("Try again");
    expect(html).toContain('role="alert"');
  });

  it("renders empty state when no competitors exist", () => {
    const html = renderToStaticMarkup(<CompetitorsMatrix {...baseProps} />);
    expect(html).toContain("No competitors mapped yet");
    expect(html).toContain(
      `/workspace/${workspaceId}/ideas/${ideaId}/research-setup`,
    );
  });

  it("renders 5-class filter tabs, matrix rows, and evidence-linked detail panel", () => {
    const html = renderToStaticMarkup(
      <CompetitorsMatrix
        {...baseProps}
        competitors={sampleCompetitors}
        selectedCompetitorId={sampleCompetitors[0].id}
        detail={sampleDetail}
      />,
    );

    expect(html).toContain("All (2)");
    expect(html).toContain("Direct (1)");
    expect(html).toContain("Indirect (0)");
    expect(html).toContain("Substitute (0)");
    expect(html).toContain("Emerging (0)");
    expect(html).toContain("Internal / DIY (1)");

    expect(html).toContain("Rival AI");
    expect(html).toContain("Automated pitch-deck validator");
    expect(html).toContain("$49/mo");
    expect(html).toContain("Fast onboarding");
    expect(html).toContain("No source citations");
    expect(html).toContain("View claims (1)");

    expect(html).toContain("Linked Evidence — Rival AI");
    expect(html).toContain(
      "Rival AI charges $49/mo on its public pricing page.",
    );
  });

  it("renders class-specific empty message when a class has no competitors", () => {
    const html = renderToStaticMarkup(
      <CompetitorsMatrix
        {...baseProps}
        competitors={sampleCompetitors}
        selectedClass="emerging"
      />,
    );
    expect(html).toContain("No competitors classified as");
    expect(html).toContain("Emerging");
  });
});
