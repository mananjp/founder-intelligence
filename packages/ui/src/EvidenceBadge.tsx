import type { ClaimStatus } from "@fi/contracts";

const COLOR: Record<ClaimStatus, string> = {
  verified: "var(--fi-verified)", supported: "var(--fi-verified)",
  directional: "var(--fi-assumption)", conflicting: "var(--fi-conflicting)",
  inferred: "var(--fi-accent)", assumption: "var(--fi-assumption)", unverified: "var(--fi-muted)",
};

/** Renders a claim's evidence status. Never hide this badge next to a claim (Bible §27: don't hide uncertainty). */
export function EvidenceBadge({ status }: { status: ClaimStatus }) {
  return (
    <span style={{ color: COLOR[status], border: `1px solid ${COLOR[status]}`, borderRadius: 999, padding: "2px 8px", fontSize: 12 }}>
      {status}
    </span>
  );
}
