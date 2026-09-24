"use client";
import { EvidenceBadge } from "@fi/ui";
import type { Claim } from "@fi/contracts";

/** Reusable evidence list used on Market Map, Competitors, Customers, Scorecard, Copilot answers. */
export function EvidencePanel({ claims }: { claims: Claim[] }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
      {claims.map((c) => (
        <li
          key={c.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            padding: 12,
            background: "var(--fi-surface)",
            borderRadius: "var(--fi-radius)",
          }}
        >
          <span>{c.statement}</span>
          <EvidenceBadge status={c.status} />
        </li>
      ))}
    </ul>
  );
}
