"use client";

import { useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import { showToast } from "@/lib/toast";
import type { Idea } from "@fi/contracts";

export default function Page() {
  const params = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const workspaceId = params.workspaceId;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!workspaceId) {
      showToast("Workspace is unavailable.", "error");
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (!trimmedTitle || trimmedDescription.length < 10) {
      const message =
        "Please add a title and a description of at least 10 characters.";
      setError(message);
      showToast(message, "error");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const response = await apiFetch<{ data: Idea }>(
        `/v1/workspaces/${workspaceId}/ideas`,
        {
          method: "POST",
          body: JSON.stringify({
            title: trimmedTitle,
            rawDescription: trimmedDescription,
            geography: [],
          }),
        },
      );

      showToast("Idea created successfully.", "success");
      router.push(`/workspace/${workspaceId}/ideas/${response.data.id}`);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Something went wrong while creating your idea.";
      setError(message);
      showToast(message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      style={{
        maxWidth: 820,
        margin: "0 auto",
        padding: "32px 24px 56px",
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <p
          style={{
            margin: 0,
            color: "var(--fi-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            fontSize: 12,
          }}
        >
          New idea
        </p>
        <h1 style={{ margin: "8px 0 0" }}>Start a new idea</h1>
      </header>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "grid",
          gap: 18,
          padding: 24,
          borderRadius: "var(--fi-radius)",
          background: "var(--fi-surface)",
          border: "1px solid var(--fi-border)",
        }}
      >
        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ fontWeight: 600 }}>Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="AI-powered hiring assistant for SMBs"
            style={{
              background: "var(--fi-overlay)",
              border: "1px solid var(--fi-border-strong)",
              borderRadius: "var(--fi-radius)",
              color: "var(--fi-text)",
              padding: "12px 14px",
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ fontWeight: 600 }}>Description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe the problem, audience, and why this matters."
            rows={8}
            style={{
              background: "var(--fi-overlay)",
              border: "1px solid var(--fi-border-strong)",
              borderRadius: "var(--fi-radius)",
              color: "var(--fi-text)",
              padding: "12px 14px",
              resize: "vertical",
            }}
          />
        </label>

        {error && (
          <div
            role="alert"
            style={{
              padding: 12,
              borderRadius: "var(--fi-radius)",
              background: "var(--fi-conflicting-bg)",
              border: "1px solid var(--fi-conflicting-border)",
              color: "var(--fi-text)",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            type="submit"
            disabled={submitting}
            style={{
              border: "none",
              borderRadius: "var(--fi-radius)",
              background: "var(--fi-accent)",
              color: "var(--fi-on-accent)",
              padding: "10px 16px",
              fontWeight: 600,
              cursor: submitting ? "wait" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Saving..." : "Create idea"}
          </button>

          <button
            type="button"
            onClick={() => router.push(`/workspace/${workspaceId}/ideas`)}
            style={{
              border: "1px solid var(--fi-border-strong)",
              borderRadius: "var(--fi-radius)",
              background: "transparent",
              color: "var(--fi-text)",
              padding: "10px 16px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}
