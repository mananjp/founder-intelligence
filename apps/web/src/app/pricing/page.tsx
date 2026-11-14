// Screen: Pricing (Bible §33, §34, §36) — Show research depth and value.
// Owner: Frontend squad / Pod B (AnmolDholiya). Reads PLAN_TIERS from '@fi/contracts'.
import { PLAN_TIERS } from "@fi/contracts";

export default function PricingPage() {
  const tiers = Object.values(PLAN_TIERS);

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "48px 24px",
      }}
    >
      <header style={{ textAlign: "center", marginBottom: 48 }}>
        <h1
          style={{
            fontSize: "var(--fi-text-2xl)",
            lineHeight: "var(--fi-leading-2xl)",
            marginBottom: 12,
            fontFamily: "var(--fi-font-display)",
          }}
        >
          Predictable, Evidence-Backed Intelligence
        </h1>
        <p
          style={{
            color: "var(--fi-muted)",
            fontSize: "var(--fi-text-md)",
            maxWidth: 640,
            margin: "0 auto",
          }}
        >
          Pricing based on research depth, evidence validation, and market continuity — not arbitrary message counters.
        </p>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 24,
          alignItems: "stretch",
        }}
      >
        {tiers.map((tier) => {
          const isPopular = tier.id === "pro";
          return (
            <div
              key={tier.id}
              style={{
                background: "var(--fi-surface)",
                border: isPopular
                  ? "2px solid var(--fi-accent-text)"
                  : "1px solid var(--fi-border)",
                borderRadius: "var(--fi-radius)",
                padding: 32,
                display: "flex",
                flexDirection: "column",
                position: "relative",
                boxShadow: "var(--fi-shadow)",
              }}
            >
              {isPopular && (
                <div
                  style={{
                    position: "absolute",
                    top: -12,
                    right: 24,
                    background: "var(--fi-accent-strong)",
                    color: "var(--fi-on-accent)",
                    padding: "2px 12px",
                    borderRadius: "var(--fi-radius-sm)",
                    fontSize: "var(--fi-text-xs)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Most Popular
                </div>
              )}

              <div style={{ marginBottom: 20 }}>
                <h2
                  style={{
                    fontSize: "var(--fi-text-xl)",
                    lineHeight: "var(--fi-leading-xl)",
                    margin: "0 0 8px 0",
                  }}
                >
                  {tier.name}
                </h2>
                <p
                  style={{
                    color: "var(--fi-muted)",
                    fontSize: "var(--fi-text-sm)",
                    lineHeight: "var(--fi-leading-sm)",
                    minHeight: 40,
                    margin: 0,
                  }}
                >
                  {tier.description}
                </p>
              </div>

              <div style={{ marginBottom: 24 }}>
                <span
                  style={{
                    fontSize: "var(--fi-text-2xl)",
                    fontWeight: 700,
                  }}
                >
                  ${tier.priceMonthlyUsd}
                </span>
                <span style={{ color: "var(--fi-muted)", fontSize: "var(--fi-text-sm)" }}>
                  {" "}/ month
                </span>
              </div>

              <div
                style={{
                  borderTop: "1px solid var(--fi-border)",
                  borderBottom: "1px solid var(--fi-border)",
                  padding: "16px 0",
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "var(--fi-text-sm)",
                    marginBottom: 10,
                  }}
                >
                  <span style={{ color: "var(--fi-muted)" }}>Monthly research runs:</span>
                  <span style={{ fontWeight: 600 }}>{tier.runsPerMonth} runs</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "var(--fi-text-sm)",
                  }}
                >
                  <span style={{ color: "var(--fi-muted)" }}>Allowed depth:</span>
                  <span style={{ display: "flex", gap: 6 }}>
                    {tier.allowedDepths.map((depth) => (
                      <span
                        key={depth}
                        style={{
                          background: "var(--fi-overlay)",
                          border: "1px solid var(--fi-border-strong)",
                          borderRadius: "var(--fi-radius-sm)",
                          padding: "2px 8px",
                          fontSize: "var(--fi-text-xs)",
                          textTransform: "capitalize",
                        }}
                      >
                        {depth}
                      </span>
                    ))}
                  </span>
                </div>
              </div>

              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: "0 0 32px 0",
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {tier.features.map((feature, idx) => (
                  <li
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      fontSize: "var(--fi-text-sm)",
                      lineHeight: "var(--fi-leading-sm)",
                    }}
                  >
                    <span style={{ color: "var(--fi-verified)", fontWeight: "bold" }}>✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "var(--fi-radius-sm)",
                  border: isPopular ? "none" : "1px solid var(--fi-border-strong)",
                  background: isPopular ? "var(--fi-accent-strong)" : "var(--fi-surface)",
                  color: isPopular ? "var(--fi-on-accent)" : "var(--fi-text)",
                  fontWeight: 600,
                  fontSize: "var(--fi-text-sm)",
                  cursor: "pointer",
                  transition: "opacity 0.2s ease",
                }}
              >
                {tier.priceMonthlyUsd === 0 ? "Get Started Free" : `Upgrade to ${tier.name.split("/")[0].trim()}`}
              </button>
            </div>
          );
        })}
      </section>
    </main>
  );
}
