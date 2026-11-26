// Screen: Intelligence Home (Bible §33) — Executive dashboard for the project.
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

const IDEA_MODULES = [
  {
    slug: "reports",
    title: "Reports & Quick Briefs",
    description:
      "Generate an evidence-backed quick brief from the latest completed research run and export to PDF.",
    primary: true,
  },
  {
    slug: "research-setup",
    title: "Research Setup",
    description: "Scope geography, depth, and research questions.",
  },
  {
    slug: "research-live",
    title: "Research Live",
    description: "Inspect active and completed research runs.",
  },
  {
    slug: "evidence",
    title: "Evidence Vault",
    description: "Claims, sources, confidence labels, and contradictions.",
  },
  {
    slug: "scorecard",
    title: "Scorecard",
    description: "Opportunity dimensions and evidence coverage.",
  },
  {
    slug: "competitors",
    title: "Competitors",
    description: "Competitive landscape and positioning profiles.",
  },
  {
    slug: "customers",
    title: "Customers & ICP",
    description: "ICP, pain points, jobs-to-be-done, and customer evidence.",
  },
  {
    slug: "assumptions",
    title: "Assumptions",
    description: "Track critical unproven thesis assumptions.",
  },
  {
    slug: "history",
    title: "History",
    description: "Compare previous research runs and decisions.",
  },
] as const;

export default function Page() {
  const params = useParams<{ workspaceId: string; ideaId: string }>();
  const workspaceId = params.workspaceId;
  const ideaId = params.ideaId;

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 56px" }}>
      <nav
        aria-label="Breadcrumb"
        style={{
          display: "flex",
          gap: 8,
          fontSize: 12,
          color: "var(--fi-muted)",
          marginBottom: 16,
        }}
      >
        <Link
          href={`/workspace/${workspaceId}`}
          style={{ color: "var(--fi-accent-text)", textDecoration: "none" }}
        >
          Workspace
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          href={`/workspace/${workspaceId}/ideas`}
          style={{ color: "var(--fi-accent-text)", textDecoration: "none" }}
        >
          Ideas
        </Link>
        <span aria-hidden="true">/</span>
        <span>Intelligence Home</span>
      </nav>

      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: "0 0 8px" }}>Intelligence Home</h1>
        <p style={{ margin: 0, color: "var(--fi-muted)" }}>
          Executive hub for research runs, evidence, scoring, and generated reports.
        </p>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        {IDEA_MODULES.map((mod) => (
          <Link
            key={mod.slug}
            href={`/workspace/${workspaceId}/ideas/${ideaId}/${mod.slug}`}
            style={{
              display: "grid",
              gap: 8,
              padding: 20,
              borderRadius: "var(--fi-radius)",
              background: "var(--fi-surface)",
              border:
                "primary" in mod && mod.primary
                  ? "1px solid var(--fi-accent-text)"
                  : "1px solid var(--fi-border)",
              color: "var(--fi-text)",
              textDecoration: "none",
            }}
          >
            <strong style={{ fontSize: 17 }}>{mod.title}</strong>
            <span style={{ color: "var(--fi-muted)", fontSize: 14, lineHeight: 1.5 }}>
              {mod.description}
            </span>
          </Link>
        ))}
      </section>
    </main>
  );
}
