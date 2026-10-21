import Link from "next/link";

export default function NotFound() {
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
        style={{
          maxWidth: 480,
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
            color: "var(--fi-accent, #3b82f6)",
            display: "block",
            marginBottom: 8,
          }}
        >
          404
        </span>
        <h1 style={{ margin: "0 0 12px 0", fontSize: 24 }}>Page not found</h1>
        <p
          style={{
            margin: "0 0 24px 0",
            color: "var(--fi-muted, #94a3b8)",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          The page or resource you requested doesn't exist or has been moved.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "10px 20px",
            borderRadius: "var(--fi-radius, 8px)",
            background: "var(--fi-accent, #3b82f6)",
            color: "var(--fi-on-accent, #ffffff)",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Back to Overview
        </Link>
      </div>
    </main>
  );
}
