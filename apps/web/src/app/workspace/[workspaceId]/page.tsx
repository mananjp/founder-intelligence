"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import type { Idea } from "@fi/contracts";
import {
  EmptyIdeasState,
  ErrorBanner,
  LoadingState,
} from "@/components/WorkspaceState";

export default function Page() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadWorkspace() {
    if (!workspaceId) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch<{ data: Idea[] }>(
        `/v1/workspaces/${workspaceId}/ideas`,
      );

      setIdeas(response.data);
    } catch {
      setError("We couldn’t load the workspace overview.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkspace();
  }, [workspaceId]);

  const stats = useMemo(
    () => [
      {
        label: "Ideas",
        value: ideas.length,
      },
      {
        label: "Active",
        value: ideas.filter(
          (idea) => Boolean(idea.rawDescription && idea.rawDescription.length > 0),
        ).length,
      },
      {
        label: "Ready",
        value: Math.min(ideas.length, 1),
      },
    ],
    [ideas],
  );

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "32px 24px 56px",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 20,
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
            Workspace
          </p>
          <h1 style={{ margin: "8px 0 0" }}>Overview</h1>
        </div>

        <a
          href={`/workspace/${workspaceId}/ideas/new`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "10px 16px",
            borderRadius: "var(--fi-radius)",
            background: "var(--fi-accent)",
            color: "var(--fi-on-accent)",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          New idea
        </a>
      </header>

      {loading && <LoadingState label="Loading workspace..." />}

      {error && (
        <ErrorBanner
          title="Workspace unavailable"
          message={`${error} Try again in a moment.`}
          onRetry={() => void loadWorkspace()}
        />
      )}

      {!loading && !error && ideas.length === 0 && (
        <EmptyIdeasState
          workspaceId={workspaceId ?? ""}
          title="This workspace is ready for ideas"
          description="Start with one idea to begin building evidence and research around it."
        />
      )}

      {!loading && !error && ideas.length > 0 && (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 16,
              marginBottom: 24,
            }}
          >
            {stats.map((stat) => (
              <div
                key={stat.label}
                style={{
                  padding: 18,
                  borderRadius: "var(--fi-radius)",
                  background: "var(--fi-surface)",
                  border: "1px solid var(--fi-border)",
                }}
              >
                <div style={{ color: "var(--fi-muted)", marginBottom: 8 }}>
                  {stat.label}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{stat.value}</div>
              </div>
            ))}
          </section>

          <section
            style={{
              display: "grid",
              gap: 16,
            }}
          >
            <h2 style={{ margin: 0 }}>Recent ideas</h2>

            {ideas.map((idea) => (
              <article
                key={idea.id}
                style={{
                  display: "grid",
                  gap: 10,
                  padding: 18,
                  borderRadius: "var(--fi-radius)",
                  background: "var(--fi-surface)",
                  border: "1px solid var(--fi-border)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <h3 style={{ margin: 0 }}>{idea.title}</h3>
                  <a
                    href={`/workspace/${workspaceId}/ideas/${idea.id}`}
                    style={{
                      color: "var(--fi-accent)",
                      textDecoration: "none",
                      fontWeight: 600,
                    }}
                  >
                    Open
                  </a>
                </div>

                <p style={{ margin: 0, color: "var(--fi-muted)" }}>
                  {idea.rawDescription}
                </p>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
