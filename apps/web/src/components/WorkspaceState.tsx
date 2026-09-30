import React from "react";

type StateBannerProps = {
  title: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
};

export function LoadingState({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      style={{
        display: "grid",
        gap: 8,
        padding: 20,
        border: "1px solid var(--fi-border)",
        borderRadius: "var(--fi-radius)",
        background: "var(--fi-overlay)",
        color: "var(--fi-text)",
      }}
    >
      <strong style={{ fontSize: 16 }}>{label}</strong>
      <span style={{ color: "var(--fi-muted)" }}>Preparing the latest workspace data.</span>
    </div>
  );
}

export function ErrorBanner({
  title,
  message,
  onRetry,
  retryLabel = "Try again",
}: StateBannerProps) {
  return (
    <div
      role="alert"
      style={{
        display: "grid",
        gap: 12,
        padding: 18,
        border: "1px solid var(--fi-conflicting-border)",
        borderRadius: "var(--fi-radius)",
        background: "var(--fi-conflicting-bg)",
        color: "var(--fi-text)",
      }}
    >
      <strong style={{ fontSize: 16 }}>{title}</strong>
      <p style={{ margin: 0, color: "var(--fi-text)" }}>{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          style={{
            justifySelf: "start",
            border: "1px solid var(--fi-border-strong)",
            background: "var(--fi-surface)",
            color: "var(--fi-text)",
            borderRadius: "var(--fi-radius)",
            padding: "10px 14px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function EmptyIdeasState({
  workspaceId,
  title = "No ideas yet",
  description = "Add an idea and FI will build the evidence behind it.",
}: {
  workspaceId: string;
  title?: string;
  description?: string;
}) {
  return (
    <section
      style={{
        display: "grid",
        gap: 18,
        padding: 28,
        border: "1px solid var(--fi-border)",
        borderRadius: "var(--fi-radius)",
        background: "var(--fi-surface)",
      }}
    >
      <div style={{ display: "grid", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 24 }}>{title}</h2>
        <p style={{ margin: 0, color: "var(--fi-muted)" }}>{description}</p>
      </div>

      <a
        href={`/workspace/${workspaceId}/ideas/new`}
        style={{
          display: "inline-flex",
          width: "fit-content",
          textDecoration: "none",
          borderRadius: "var(--fi-radius)",
          background: "var(--fi-accent)",
          color: "var(--fi-on-accent)",
          padding: "10px 16px",
          fontWeight: 600,
        }}
      >
        Add your first idea
      </a>
    </section>
  );
}
