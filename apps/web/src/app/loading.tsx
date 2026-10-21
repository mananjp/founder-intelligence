export default function Loading() {
  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "32px 24px 56px",
      }}
    >
      <div
        style={{
          height: 32,
          width: 180,
          background: "var(--fi-border, #334155)",
          borderRadius: "var(--fi-radius, 8px)",
          marginBottom: 24,
          opacity: 0.6,
        }}
      />
      <div
        style={{
          display: "grid",
          gap: 16,
        }}
      >
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              padding: 24,
              borderRadius: "var(--fi-radius, 8px)",
              background: "var(--fi-surface, #1e293b)",
              border: "1px solid var(--fi-border, #334155)",
              display: "grid",
              gap: 12,
            }}
          >
            <div
              style={{
                height: 20,
                width: "40%",
                background: "var(--fi-border, #334155)",
                borderRadius: 4,
                opacity: 0.6,
              }}
            />
            <div
              style={{
                height: 14,
                width: "80%",
                background: "var(--fi-border, #334155)",
                borderRadius: 4,
                opacity: 0.4,
              }}
            />
          </div>
        ))}
      </div>
    </main>
  );
}
