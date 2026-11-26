import React from "react";
import { EvidenceBadge } from "@fi/ui";
import type { QuickBriefReport } from "@fi/contracts";

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "Unavailable";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function formatCoveragePct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Unavailable";
  }
  return `${Math.round(value * 100)}%`;
}

function safeHref(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function QuickBriefDocument({
  report,
}: {
  report: QuickBriefReport;
}) {
  const { sections } = report;
  const {
    metadata,
    executiveVerdict,
    icp,
    competitiveLandscape,
    opportunityScore,
    appendix,
  } = sections;

  return (
    <article className="fi-report-doc" aria-label="Quick brief report">
      {/* A. Report Metadata */}
      <section id="section-metadata" className="fi-report-section">
        <div className="fi-section-header">
          <div>
            <p className="fi-reports-eyebrow">Report Metadata</p>
            <h2>{metadata.ideaTitle}</h2>
          </div>
          <span className="fi-verdict-pill">
            {metadata.reportType} · v{report.version}
          </span>
        </div>

        <div className="fi-meta-strip">
          <div className="fi-meta-cell">
            <span className="fi-meta-label">Workspace</span>
            <span className="fi-meta-value">{metadata.workspaceName}</span>
          </div>
          <div className="fi-meta-cell">
            <span className="fi-meta-label">Generated</span>
            <span className="fi-meta-value">
              {formatTimestamp(report.createdAt)}
            </span>
          </div>
          <div className="fi-meta-cell">
            <span className="fi-meta-label">Latest Valid Run</span>
            <span className="fi-meta-value">
              {metadata.runDepth} · {metadata.runState} ({metadata.runId.slice(0, 8)})
            </span>
          </div>
          <div className="fi-meta-cell">
            <span className="fi-meta-label">Markets / Geography</span>
            <span className="fi-meta-value">
              {metadata.geography.length > 0
                ? metadata.geography.join(", ")
                : "Not specified"}
            </span>
          </div>
          <div className="fi-meta-cell">
            <span className="fi-meta-label">Evidence Base</span>
            <span className="fi-meta-value">
              {metadata.dataCoverageSummary.sourceCount} sources ·{" "}
              {metadata.dataCoverageSummary.claimCount} claims
            </span>
          </div>
        </div>
      </section>

      {/* B. Executive Verdict */}
      <section id="section-verdict" className="fi-report-section">
        <div className="fi-section-header">
          <h2>1. Executive Verdict</h2>
          <span className="fi-verdict-pill">
            {executiveVerdict.verdictLabel}
          </span>
        </div>

        <p style={{ margin: 0, lineHeight: 1.6 }}>{executiveVerdict.summary}</p>

        {executiveVerdict.suggestedNextAction ? (
          <div className="fi-callout">
            <span className="fi-meta-label">
              Suggested Next Action (
              {executiveVerdict.suggestedNextAction.source === "recommendation"
                ? "AI Recommendation"
                : "Derived from open research gaps"}
              )
            </span>
            <strong>{executiveVerdict.suggestedNextAction.action}</strong>
            <p style={{ margin: 0, color: "var(--fi-muted)" }}>
              {executiveVerdict.suggestedNextAction.rationale}
            </p>
          </div>
        ) : (
          <div className="fi-notice-muted">
            No suggested next action was available from the latest run.
          </div>
        )}

        <div className="fi-two-col">
          <div className="fi-subcard">
            <h3>Strengths</h3>
            {executiveVerdict.strengths.length > 0 ? (
              <ul className="fi-list">
                {executiveVerdict.strengths.map((item, idx) => (
                  <li
                    key={item.claimId ?? `strength-${idx}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 10,
                    }}
                  >
                    <span>{item.statement}</span>
                    {item.status ? <EvidenceBadge status={item.status} /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="fi-notice-muted" style={{ margin: 0 }}>
                No verified or supported strengths recorded yet.
              </p>
            )}
          </div>

          <div className="fi-subcard">
            <h3>Risks</h3>
            {executiveVerdict.risks.length > 0 ? (
              <ul className="fi-list">
                {executiveVerdict.risks.map((risk, idx) => (
                  <li key={`risk-${idx}`}>{risk.statement}</li>
                ))}
              </ul>
            ) : (
              <p className="fi-notice-muted" style={{ margin: 0 }}>
                No explicit risk signals recorded in the latest run.
              </p>
            )}
          </div>
        </div>

        <div className="fi-subcard">
          <h3>Critical Uncertainties</h3>
          {executiveVerdict.criticalUncertainties.length > 0 ? (
            <ul className="fi-list">
              {executiveVerdict.criticalUncertainties.map((item, idx) => (
                <li key={`uncertainty-${idx}`}>{item}</li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0, color: "var(--fi-muted)" }}>
              No critical uncertainties were logged.
            </p>
          )}
        </div>
      </section>

      {/* C. Ideal Customer Profile (ICP) */}
      <section id="section-icp" className="fi-report-section">
        <div className="fi-section-header">
          <h2>2. Ideal Customer Profile (ICP)</h2>
          <span className="fi-meta-label">Status: {icp.status}</span>
        </div>

        <p style={{ margin: 0, color: "var(--fi-muted)" }}>{icp.summary}</p>

        <div className="fi-meta-cell">
          <span className="fi-meta-label">Primary Target Customer</span>
          <span className="fi-meta-value">
            {icp.primaryCustomer ??
              "Not sufficiently established in the latest research run."}
          </span>
        </div>

        {icp.segments.length > 0 && (
          <div className="fi-two-col">
            {icp.segments.map((seg, idx) => (
              <div key={seg.id ?? `seg-${idx}`} className="fi-subcard">
                <h3>{seg.name}</h3>
                {seg.description ? (
                  <p style={{ margin: 0, color: "var(--fi-muted)" }}>
                    {seg.description}
                  </p>
                ) : null}
                <div className="fi-meta-strip">
                  {seg.industry ? (
                    <div>
                      <span className="fi-meta-label">Industry</span>
                      <div className="fi-meta-value">{seg.industry}</div>
                    </div>
                  ) : null}
                  {seg.companySize ? (
                    <div>
                      <span className="fi-meta-label">Company size</span>
                      <div className="fi-meta-value">{seg.companySize}</div>
                    </div>
                  ) : null}
                  {seg.buyerPersona ? (
                    <div>
                      <span className="fi-meta-label">Buyer</span>
                      <div className="fi-meta-value">{seg.buyerPersona}</div>
                    </div>
                  ) : null}
                  {seg.userPersona ? (
                    <div>
                      <span className="fi-meta-label">User</span>
                      <div className="fi-meta-value">{seg.userPersona}</div>
                    </div>
                  ) : null}
                </div>
                {seg.jobsToBeDone.length > 0 ? (
                  <div>
                    <span className="fi-meta-label">Jobs to be done</span>
                    <ul className="fi-list" style={{ marginTop: 6 }}>
                      {seg.jobsToBeDone.map((job, jIdx) => (
                        <li key={`job-${jIdx}`}>{job}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <div className="fi-two-col">
          <div className="fi-subcard">
            <h3>Pain Points &amp; Needs</h3>
            {icp.painPoints.length > 0 ? (
              <ul className="fi-list">
                {icp.painPoints.map((pain, idx) => (
                  <li key={`pain-${idx}`}>{pain}</li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: 0, color: "var(--fi-muted)" }}>
                No customer pain points were confirmed in this run.
              </p>
            )}
          </div>

          <div className="fi-subcard">
            <h3>Buying Motivations &amp; Objections</h3>
            {icp.buyingMotivations.length === 0 &&
            icp.objectionsAndRisks.length === 0 ? (
              <p style={{ margin: 0, color: "var(--fi-muted)" }}>
                No buying motivations or customer objections were recorded.
              </p>
            ) : (
              <ul className="fi-list">
                {icp.buyingMotivations.map((m, idx) => (
                  <li key={`mot-${idx}`}>
                    <strong>Motivation:</strong> {m}
                  </li>
                ))}
                {icp.objectionsAndRisks.map((o, idx) => (
                  <li key={`obj-${idx}`}>
                    <strong>Objection / Risk:</strong> {o}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="fi-subcard">
          <h3>Customer Evidence</h3>
          {icp.customerEvidence.length > 0 ? (
            <div className="fi-table-wrap">
              <table className="fi-table">
                <thead>
                  <tr>
                    <th>Claim</th>
                    <th>Status</th>
                    <th>Evidence Quote</th>
                  </tr>
                </thead>
                <tbody>
                  {icp.customerEvidence.map((ev) => (
                    <tr key={ev.id}>
                      <td>{ev.statement}</td>
                      <td>
                        <EvidenceBadge status={ev.status} />
                      </td>
                      <td style={{ color: "var(--fi-muted)" }}>
                        {ev.quote ? `“${ev.quote}”` : "No quote linked"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ margin: 0, color: "var(--fi-muted)" }}>
              No customer claims were extracted in this run.
            </p>
          )}
        </div>
      </section>

      {/* D. Competitive Landscape */}
      <section id="section-competitors" className="fi-report-section">
        <div className="fi-section-header">
          <h2>3. Competitive Landscape</h2>
          <span className="fi-meta-label">
            {competitiveLandscape.competitors.length} competitors mapped
          </span>
        </div>

        {(competitiveLandscape.alternativesSummary ||
          competitiveLandscape.differentiationSummary) && (
          <div className="fi-two-col">
            {competitiveLandscape.alternativesSummary ? (
              <div className="fi-subcard">
                <span className="fi-meta-label">Current Alternatives</span>
                <p style={{ margin: 0 }}>
                  {competitiveLandscape.alternativesSummary}
                </p>
              </div>
            ) : null}
            {competitiveLandscape.differentiationSummary ? (
              <div className="fi-subcard">
                <span className="fi-meta-label">Intended Differentiation</span>
                <p style={{ margin: 0 }}>
                  {competitiveLandscape.differentiationSummary}
                </p>
              </div>
            ) : null}
          </div>
        )}

        {competitiveLandscape.competitors.length > 0 ? (
          <div className="fi-table-wrap">
            <table className="fi-table">
              <thead>
                <tr>
                  <th>Competitor</th>
                  <th>Type</th>
                  <th>Positioning &amp; Product</th>
                  <th>Pricing</th>
                  <th>Differentiation &amp; Evidence</th>
                </tr>
              </thead>
              <tbody>
                {competitiveLandscape.competitors.map((comp) => {
                  const websiteHref = comp.website
                    ? safeHref(comp.website)
                    : null;
                  return (
                    <tr key={comp.id}>
                      <td>
                        <strong>{comp.name}</strong>
                        {websiteHref ? (
                          <div>
                            <a
                              href={websiteHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="fi-link"
                              style={{ fontSize: "var(--fi-text-xs)" }}
                            >
                              {websiteHref}
                            </a>
                          </div>
                        ) : null}
                      </td>
                      <td>{comp.kind}</td>
                      <td>
                        {[comp.positioning, comp.product, comp.description]
                          .filter(Boolean)
                          .join(" — ") || (
                          <span style={{ color: "var(--fi-muted)" }}>
                            Not recorded
                          </span>
                        )}
                      </td>
                      <td>
                        {comp.pricing ?? (
                          <span style={{ color: "var(--fi-muted)" }}>
                            Not recorded
                          </span>
                        )}
                      </td>
                      <td>
                        {[
                          comp.differentiation,
                          comp.strengths.length > 0
                            ? `Strengths: ${comp.strengths.join("; ")}`
                            : null,
                          comp.limitations.length > 0
                            ? `Limitations: ${comp.limitations.join("; ")}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || (
                          <span style={{ color: "var(--fi-muted)" }}>
                            Not recorded
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="fi-notice-muted">{competitiveLandscape.summary}</div>
        )}

        {competitiveLandscape.competitiveClaims.length > 0 && (
          <div className="fi-subcard">
            <h3>Competitive Claims</h3>
            <ul className="fi-list">
              {competitiveLandscape.competitiveClaims.map((claim) => (
                <li
                  key={claim.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "flex-start",
                  }}
                >
                  <span>{claim.statement}</span>
                  <EvidenceBadge status={claim.status} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* E. Opportunity Score & Evidence Coverage */}
      <section id="section-score" className="fi-report-section">
        <div className="fi-section-header">
          <h2>4. Opportunity Score &amp; Evidence Coverage</h2>
          <span className="fi-meta-label">
            Coverage: {opportunityScore.coverageAssessment}
          </span>
        </div>

        {opportunityScore.available ? (
          <>
            <div className="fi-score-grid">
              <div className="fi-score-card">
                <span className="fi-meta-label">Opportunity Score</span>
                <div className="fi-score-big">
                  {opportunityScore.overallScore !== null
                    ? `${opportunityScore.overallScore.toFixed(1)}`
                    : "Unavailable"}
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 500,
                      color: "var(--fi-muted)",
                    }}
                  >
                    {" "}
                    / 10
                  </span>
                </div>
              </div>

              <div className="fi-score-card">
                <span className="fi-meta-label">Evidence Coverage</span>
                <div className="fi-score-big">
                  {formatCoveragePct(opportunityScore.evidenceCoverage)}
                </div>
                <div className="fi-bar-track" aria-hidden="true">
                  <div
                    className="fi-bar-fill"
                    style={{
                      width: `${Math.round(
                        (opportunityScore.evidenceCoverage ?? 0) * 100,
                      )}%`,
                    }}
                  />
                </div>
              </div>

              <div className="fi-score-card">
                <span className="fi-meta-label">Scoring Model</span>
                <span className="fi-meta-value">
                  {opportunityScore.scoringModelVersion ?? "Unavailable"}
                </span>
                <span
                  style={{
                    fontSize: "var(--fi-text-xs)",
                    color: "var(--fi-muted)",
                  }}
                >
                  {formatTimestamp(opportunityScore.scoredAt)}
                </span>
              </div>
            </div>

            <div className="fi-notice-warning" role="note">
              {opportunityScore.uncertaintyNotice}
            </div>

            {opportunityScore.dimensions.length > 0 ? (
              <div className="fi-table-wrap">
                <table className="fi-table">
                  <thead>
                    <tr>
                      <th>Dimension</th>
                      <th>Score</th>
                      <th>Evidence Coverage</th>
                      <th>Cited Claims</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunityScore.dimensions.map((dim) => (
                      <tr key={dim.key}>
                        <td>{dim.label}</td>
                        <td>
                          <strong>{dim.score.toFixed(1)}</strong> / 10
                        </td>
                        <td>{formatCoveragePct(dim.evidenceCoverage)}</td>
                        <td>{dim.citedClaimIds.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="fi-notice-muted">
                No per-dimension breakdown was recorded for this score.
              </div>
            )}
          </>
        ) : (
          <div className="fi-notice-muted">
            {opportunityScore.uncertaintyNotice}
          </div>
        )}
      </section>

      {/* F. Appendix */}
      <section id="section-appendix" className="fi-report-section">
        <div className="fi-section-header">
          <h2>5. Appendix &amp; Evidence Lineage</h2>
          <span className="fi-meta-label">
            {appendix.sources.length} sources · {appendix.evidenceSummaries.length}{" "}
            evidence items
          </span>
        </div>

        <div className="fi-subcard">
          <h3>Research Limitations</h3>
          {appendix.researchLimitations.length > 0 ? (
            <ul className="fi-list">
              {appendix.researchLimitations.map((item, idx) => (
                <li key={`lim-${idx}`}>{item}</li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0, color: "var(--fi-muted)" }}>
              No major research limitations recorded.
            </p>
          )}
        </div>

        <div className="fi-subcard">
          <h3>Claims Ledger ({appendix.claims.length})</h3>
          {appendix.claims.length > 0 ? (
            <div className="fi-table-wrap">
              <table className="fi-table">
                <thead>
                  <tr>
                    <th>Statement</th>
                    <th>Module</th>
                    <th>Origin</th>
                    <th>Status</th>
                    <th>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {appendix.claims.map((claim) => (
                    <tr key={claim.id}>
                      <td>{claim.statement}</td>
                      <td>{claim.module}</td>
                      <td>{claim.origin}</td>
                      <td>
                        <EvidenceBadge status={claim.status} />
                      </td>
                      <td>{claim.evidenceCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ margin: 0, color: "var(--fi-muted)" }}>
              No claims recorded in this run.
            </p>
          )}
        </div>

        <div className="fi-two-col">
          <div className="fi-subcard">
            <h3>Assumptions ({appendix.assumptions.length})</h3>
            {appendix.assumptions.length > 0 ? (
              <ul className="fi-list">
                {appendix.assumptions.map((a) => (
                  <li key={a.id}>
                    <strong>[{a.importance} / {a.status}]</strong> {a.statement}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: 0, color: "var(--fi-muted)" }}>
                No assumptions linked to this idea.
              </p>
            )}
          </div>

          <div className="fi-subcard">
            <h3>Unknowns &amp; Contradictions</h3>
            {appendix.contradictions.length > 0 && (
              <ul className="fi-list">
                {appendix.contradictions.map((c, idx) => (
                  <li key={`contra-${idx}`}>
                    <strong>Contradiction:</strong> {c.claimStatement} vs{" "}
                    {c.contradictsStatement}
                    {c.note ? ` (${c.note})` : ""}
                  </li>
                ))}
              </ul>
            )}
            {appendix.unknowns.length > 0 ? (
              <ul className="fi-list">
                {appendix.unknowns.map((u, idx) => (
                  <li key={`unk-${idx}`}>{u}</li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: 0, color: "var(--fi-muted)" }}>
                No explicit unknowns recorded.
              </p>
            )}
          </div>
        </div>

        <div className="fi-subcard">
          <h3>Evidence Summaries ({appendix.evidenceSummaries.length})</h3>
          {appendix.evidenceSummaries.length > 0 ? (
            <div className="fi-table-wrap">
              <table className="fi-table">
                <thead>
                  <tr>
                    <th>Extracted Claim</th>
                    <th>Quote</th>
                    <th>Stance / Kind</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {appendix.evidenceSummaries.map((ev) => {
                    const href = safeHref(ev.sourceUrl);
                    return (
                      <tr key={ev.id}>
                        <td>{ev.claimText}</td>
                        <td style={{ color: "var(--fi-muted)" }}>
                          “{ev.quote}”
                        </td>
                        <td>
                          {ev.stance} · {ev.kind}
                        </td>
                        <td>
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="fi-link"
                            >
                              {ev.sourceTitle ?? ev.sourceUrl}
                            </a>
                          ) : (
                            <span>{ev.sourceTitle ?? ev.sourceUrl}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ margin: 0, color: "var(--fi-muted)" }}>
              No evidence summaries recorded in this run.
            </p>
          )}
        </div>

        <div className="fi-subcard">
          <h3>Supporting Sources ({appendix.sources.length})</h3>
          {appendix.sources.length > 0 ? (
            <div className="fi-table-wrap">
              <table className="fi-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Publisher</th>
                    <th>URL</th>
                  </tr>
                </thead>
                <tbody>
                  {appendix.sources.map((src) => {
                    const href = safeHref(src.url);
                    return (
                      <tr key={src.id}>
                        <td>{src.title ?? "Untitled source"}</td>
                        <td>{src.sourceType}</td>
                        <td>{src.publisher ?? "Unknown"}</td>
                        <td>
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="fi-link"
                            >
                              {src.url}
                            </a>
                          ) : (
                            <span>{src.url}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ margin: 0, color: "var(--fi-muted)" }}>
              No sources attached to this run.
            </p>
          )}
        </div>
      </section>
    </article>
  );
}

