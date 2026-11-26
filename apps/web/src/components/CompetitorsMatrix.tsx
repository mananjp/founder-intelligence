"use client";

import React from "react";
import type {
  Competitor,
  CompetitorClass,
  CompetitorDetail,
} from "@fi/contracts";
import { EvidencePanel } from "./EvidencePanel";
import { ErrorBanner, LoadingState } from "./WorkspaceState";

export const COMPETITOR_CLASSES: ReadonlyArray<{
  kind: CompetitorClass;
  label: string;
  description: string;
}> = [
  {
    kind: "direct",
    label: "Direct",
    description: "Solves substantially the same problem for a similar customer.",
  },
  {
    kind: "indirect",
    label: "Indirect",
    description: "Solves the same underlying need differently.",
  },
  {
    kind: "substitute",
    label: "Substitute",
    description: "A different behavior or product customers can use instead.",
  },
  {
    kind: "emerging",
    label: "Emerging",
    description: "New entrant or adjacent product showing relevant movement.",
  },
  {
    kind: "internal_diy",
    label: "Internal / DIY",
    description: "Spreadsheet, manual process, employee or internal workaround.",
  },
];

const CLASS_LABEL_MAP: Record<CompetitorClass, string> = {
  direct: "Direct",
  indirect: "Indirect",
  substitute: "Substitute",
  emerging: "Emerging",
  internal_diy: "Internal / DIY",
};

function readMetaField(
  metadata: Record<string, unknown> | undefined,
  ...keys: string[]
): string {
  if (!metadata) return "—";
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
    if (Array.isArray(value) && value.length > 0) {
      return value.map((item) => String(item)).join(", ");
    }
  }
  return "—";
}

function getClaimCount(competitor: Competitor): number {
  const raw = competitor.metadata?.claimIds ?? competitor.metadata?.claim_ids;
  return Array.isArray(raw) ? raw.length : 0;
}

export type CompetitorsMatrixProps = {
  workspaceId: string;
  ideaId: string;
  competitors: Competitor[];
  loading: boolean;
  error: string | null;
  selectedClass: CompetitorClass | "all";
  onSelectClass: (kind: CompetitorClass | "all") => void;
  onRetry: () => void;
  selectedCompetitorId: string | null;
  detail: CompetitorDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  onInspectCompetitor: (competitorId: string) => void;
};

export function CompetitorsMatrix({
  workspaceId,
  ideaId,
  competitors,
  loading,
  error,
  selectedClass,
  onSelectClass,
  onRetry,
  selectedCompetitorId,
  detail,
  detailLoading,
  detailError,
  onInspectCompetitor,
}: CompetitorsMatrixProps) {
  const filtered =
    selectedClass === "all"
      ? competitors
      : competitors.filter((c) => c.kind === selectedClass);

  const countByClass = COMPETITOR_CLASSES.reduce<Record<CompetitorClass, number>>(
    (acc, item) => {
      acc[item.kind] = competitors.filter((c) => c.kind === item.kind).length;
      return acc;
    },
    { direct: 0, indirect: 0, substitute: 0, emerging: 0, internal_diy: 0 },
  );

  return (
    <main
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: "32px 24px 56px",
        display: "grid",
        gap: 24,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              color: "var(--fi-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              fontSize: 12,
            }}
          >
            Competitive Intelligence
          </p>
          <h1 style={{ margin: "8px 0 6px" }}>Competitors Matrix</h1>
          <p style={{ margin: 0, color: "var(--fi-muted)", fontSize: 14 }}>
            Mapped across direct, indirect, substitute, emerging, and internal/DIY
            alternatives with linked evidence claims.
          </p>
        </div>

        <a
          href={`/workspace/${workspaceId}/ideas/${ideaId}/research-setup`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "10px 16px",
            borderRadius: "var(--fi-radius)",
            border: "1px solid var(--fi-border-strong)",
            background: "var(--fi-surface)",
            color: "var(--fi-text)",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Run research
        </a>
      </header>

      {loading && <LoadingState label="Loading competitors matrix..." />}

      {!loading && error && (
        <ErrorBanner
          title="Competitors unavailable"
          message={error}
          onRetry={onRetry}
        />
      )}

      {!loading && !error && competitors.length === 0 && (
        <section
          style={{
            display: "grid",
            gap: 14,
            padding: 28,
            border: "1px solid var(--fi-border)",
            borderRadius: "var(--fi-radius)",
            background: "var(--fi-surface)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20 }}>No competitors mapped yet</h2>
          <p style={{ margin: 0, color: "var(--fi-muted)" }}>
            Launch a research run to discover direct, indirect, substitute,
            emerging, and DIY competitors with evidence-backed claims.
          </p>
          <a
            href={`/workspace/${workspaceId}/ideas/${ideaId}/research-setup`}
            style={{
              display: "inline-flex",
              width: "fit-content",
              padding: "10px 16px",
              borderRadius: "var(--fi-radius)",
              background: "var(--fi-accent-strong)",
              color: "var(--fi-on-accent)",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Start research run
          </a>
        </section>
      )}

      {!loading && !error && competitors.length > 0 && (
        <>
          <nav
            aria-label="Filter by competitor class"
            style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
          >
            <button
              type="button"
              onClick={() => onSelectClass("all")}
              aria-pressed={selectedClass === "all"}
              style={{
                padding: "8px 14px",
                borderRadius: "var(--fi-radius)",
                border: "1px solid var(--fi-border-strong)",
                background:
                  selectedClass === "all"
                    ? "var(--fi-accent-strong)"
                    : "var(--fi-surface)",
                color:
                  selectedClass === "all"
                    ? "var(--fi-on-accent)"
                    : "var(--fi-text)",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              All ({competitors.length})
            </button>
            {COMPETITOR_CLASSES.map((cls) => {
              const active = selectedClass === cls.kind;
              return (
                <button
                  key={cls.kind}
                  type="button"
                  title={cls.description}
                  onClick={() => onSelectClass(cls.kind)}
                  aria-pressed={active}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "var(--fi-radius)",
                    border: "1px solid var(--fi-border-strong)",
                    background: active
                      ? "var(--fi-accent-strong)"
                      : "var(--fi-surface)",
                    color: active ? "var(--fi-on-accent)" : "var(--fi-text)",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  {cls.label} ({countByClass[cls.kind]})
                </button>
              );
            })}
          </nav>

          {filtered.length === 0 ? (
            <section
              style={{
                padding: 24,
                border: "1px solid var(--fi-border)",
                borderRadius: "var(--fi-radius)",
                background: "var(--fi-surface)",
                color: "var(--fi-muted)",
              }}
            >
              No competitors classified as{" "}
              <strong style={{ color: "var(--fi-text)" }}>
                {CLASS_LABEL_MAP[selectedClass as CompetitorClass]}
              </strong>
              .
            </section>
          ) : (
            <div
              style={{
                overflowX: "auto",
                border: "1px solid var(--fi-border)",
                borderRadius: "var(--fi-radius)",
                background: "var(--fi-surface)",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  textAlign: "left",
                  fontSize: 14,
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--fi-border-strong)",
                      color: "var(--fi-muted)",
                      fontSize: 12,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    <th style={{ padding: "12px 16px" }}>Competitor</th>
                    <th style={{ padding: "12px 16px" }}>Class</th>
                    <th style={{ padding: "12px 16px" }}>Positioning</th>
                    <th style={{ padding: "12px 16px" }}>Pricing</th>
                    <th style={{ padding: "12px 16px" }}>Strengths</th>
                    <th style={{ padding: "12px 16px" }}>Weaknesses</th>
                    <th style={{ padding: "12px 16px" }}>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((competitor) => {
                    const isSelected = selectedCompetitorId === competitor.id;
                    const claimCount = getClaimCount(competitor);
                    return (
                      <tr
                        key={competitor.id}
                        style={{
                          borderBottom: "1px solid var(--fi-border)",
                          background: isSelected
                            ? "var(--fi-info-bg)"
                            : "transparent",
                        }}
                      >
                        <td style={{ padding: "14px 16px", fontWeight: 600 }}>
                          <div>{competitor.name}</div>
                          {competitor.website ? (
                            <a
                              href={competitor.website}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                color: "var(--fi-accent-text)",
                                fontSize: 12,
                                fontWeight: 400,
                              }}
                            >
                              {competitor.website}
                            </a>
                          ) : null}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "3px 10px",
                              borderRadius: "var(--fi-radius-sm)",
                              border: "1px solid var(--fi-border-strong)",
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            {CLASS_LABEL_MAP[competitor.kind]}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            color: "var(--fi-muted)",
                          }}
                        >
                          {readMetaField(
                            competitor.metadata,
                            "positioning",
                            "summary",
                          ) !== "—"
                            ? readMetaField(
                                competitor.metadata,
                                "positioning",
                                "summary",
                              )
                            : (competitor.description ?? "—")}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          {readMetaField(
                            competitor.metadata,
                            "pricing",
                            "price",
                          )}
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            color: "var(--fi-muted)",
                          }}
                        >
                          {readMetaField(competitor.metadata, "strengths")}
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            color: "var(--fi-muted)",
                          }}
                        >
                          {readMetaField(competitor.metadata, "weaknesses")}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <button
                            type="button"
                            onClick={() => onInspectCompetitor(competitor.id)}
                            aria-pressed={isSelected}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "var(--fi-radius-sm)",
                              border: "1px solid var(--fi-accent-text)",
                              background: "transparent",
                              color: "var(--fi-accent-text)",
                              cursor: "pointer",
                              fontWeight: 600,
                              fontSize: 12,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {claimCount > 0
                              ? `View claims (${claimCount})`
                              : "View claims"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {selectedCompetitorId && (
            <section
              aria-label="Linked competitor evidence"
              style={{
                display: "grid",
                gap: 14,
                padding: 20,
                border: "1px solid var(--fi-border-strong)",
                borderRadius: "var(--fi-radius)",
                background: "var(--fi-overlay)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <h2 style={{ margin: 0, fontSize: 18 }}>
                  {detail
                    ? `Linked Evidence — ${detail.name}`
                    : "Linked Evidence"}
                </h2>
              </div>

              {detailLoading && (
                <LoadingState label="Loading linked claims..." />
              )}

              {!detailLoading && detailError && (
                <ErrorBanner
                  title="Could not load linked claims"
                  message={detailError}
                  onRetry={() => onInspectCompetitor(selectedCompetitorId)}
                />
              )}

              {!detailLoading &&
                !detailError &&
                detail &&
                detail.linkedClaims.length === 0 && (
                  <p style={{ margin: 0, color: "var(--fi-muted)" }}>
                    No evidence claims are linked to this competitor yet.
                  </p>
                )}

              {!detailLoading &&
                !detailError &&
                detail &&
                detail.linkedClaims.length > 0 && (
                  <EvidencePanel claims={detail.linkedClaims} />
                )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
