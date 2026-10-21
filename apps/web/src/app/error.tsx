"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error boundary caught error:", error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
        textAlign: "center",
        color: "var(--fi-text, #f8fafc)",
      }}
    >
      <div
        role="alert"
        style={{
          maxWidth: 480,
          width: "100%",
          padding: 32,
          borderRadius: "var(--fi-radius, 8px)",
          background: "var(--fi-surface, #1e293b)",
          border: "1px solid var(--fi-border, #334155)",
        }}
      >
        <span
          style={{
            fontSize: 48,
            fontWeight: 800,
            color: "var(--fi-danger, #ef4444)",
            display: "block",
            marginBottom: 8,
          }}
        >
          500
        </span>
        <h1 style={{ margin: "0 0 12px 0", fontSize: 24 }}>An error occurred</h1>
        <p
          style={{
            margin: "0 0 24px 0",
            color: "var(--fi-muted, #94a3b8)",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          {error.message || "An unexpected error occurred while loading this page."}
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "10px 20px",
              borderRadius: "var(--fi-radius, 8px)",
              background: "var(--fi-accent, #3b82f6)",
              color: "var(--fi-on-accent, #ffffff)",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Try again
          </button>
          <a
            href="/"
            style={{
              padding: "10px 20px",
              borderRadius: "var(--fi-radius, 8px)",
              background: "transparent",
              color: "var(--fi-text, #f8fafc)",
              border: "1px solid var(--fi-border, #334155)",
              textDecoration: "none",
              fontSize: 14,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Go home
          </a>
        </div>
      </div>
    </main>
  );
}
