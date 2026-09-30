"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import type { Idea } from "@fi/contracts";
import {
  EmptyIdeasState,
  ErrorBanner,
  LoadingState,
} from "@/components/WorkspaceState";

export default function IdeasPage() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadIdeas() {
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
      setError("Something went wrong while loading your ideas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadIdeas();
  }, [workspaceId]);

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
          marginBottom: 24,
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
          <h1 style={{ margin: "8px 0 0" }}>Ideas</h1>
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

      {loading && <LoadingState label="Loading ideas..." />}

      {error && (
        <ErrorBanner
          title="Ideas unavailable"
          message={`${error} Try again in a moment.`}
          onRetry={() => void loadIdeas()}
        />
      )}

      {!loading && !error && ideas.length === 0 && (
        <EmptyIdeasState
          workspaceId={workspaceId ?? ""}
          title="No ideas yet"
          description="Add an idea and FI will build the evidence behind it."
        />
      )}

      {!loading && !error && ideas.length > 0 && (
        <section
          style={{
            display: "grid",
            gap: 16,
          }}
        >
          {ideas.map((idea) => (
            <article
              key={idea.id}
              style={{
                display: "grid",
                gap: 12,
                padding: 20,
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
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <h2 style={{ margin: 0, fontSize: 22 }}>{idea.title}</h2>
                <a
                  href={`/workspace/${workspaceId}/ideas/${idea.id}`}
                  style={{
                    color: "var(--fi-accent)",
                    textDecoration: "none",
                    fontWeight: 600,
                  }}
                >
                  Open idea
                </a>
              </div>

              <p style={{ margin: 0, color: "var(--fi-muted)" }}>
                {idea.rawDescription}
              </p>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}