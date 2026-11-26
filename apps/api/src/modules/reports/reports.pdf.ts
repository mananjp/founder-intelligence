import fs from "node:fs";
import type { QuickBriefReport } from "@fi/contracts";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { HttpError } from "../../middleware/errorHandler.js";
import { logger } from "../../lib/logger.js";

const PDF_TIMEOUT_MS = 30_000;

export function escapeHtml(value: unknown): string {
  const str = String(value ?? "");
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function sanitizeHttpUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Unavailable";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Unavailable";
  }
  return `${Math.round(value * 100)}%`;
}

function statusPillClass(status: string): string {
  switch (status) {
    case "verified":
    case "supported":
    case "supports":
      return "pill pill-positive";
    case "conflicting":
    case "contradicts":
    case "rejected":
      return "pill pill-danger";
    case "directional":
    case "assumption":
    case "testing":
      return "pill pill-warn";
    case "inferred":
      return "pill pill-accent";
    default:
      return "pill pill-muted";
  }
}

export function renderQuickBriefHtml(report: QuickBriefReport): string {
  const s = report.sections;
  const meta = s.metadata;
  const verdict = s.executiveVerdict;
  const icp = s.icp;
  const comp = s.competitiveLandscape;
  const score = s.opportunityScore;
  const app = s.appendix;

  const strengthsHtml =
    verdict.strengths.length > 0
      ? `<ul>${verdict.strengths
          .map(
            (item) =>
              `<li>${escapeHtml(item.statement)}${
                item.status
                  ? ` <span class="${statusPillClass(item.status)}">${escapeHtml(item.status)}</span>`
                  : ""
              }</li>`,
          )
          .join("")}</ul>`
      : `<p class="muted">No verified or supported strengths were captured in this run.</p>`;

  const risksHtml =
    verdict.risks.length > 0
      ? `<ul>${verdict.risks
          .map(
            (item) =>
              `<li>${escapeHtml(item.statement)}${
                item.status
                  ? ` <span class="${statusPillClass(item.status)}">${escapeHtml(item.status)}</span>`
                  : ""
              }</li>`,
          )
          .join("")}</ul>`
      : `<p class="muted">No specific risk signals recorded.</p>`;

  const uncertaintiesHtml =
    verdict.criticalUncertainties.length > 0
      ? `<ul>${verdict.criticalUncertainties.map((u) => `<li>${escapeHtml(u)}</li>`).join("")}</ul>`
      : `<p class="muted">No explicit uncertainties recorded.</p>`;

  const nextActionHtml = verdict.suggestedNextAction
    ? `<div class="callout">
         <div class="callout-label">Suggested Next Action (${escapeHtml(
           verdict.suggestedNextAction.source === "recommendation"
             ? "Recommendation"
             : "Derived from research gaps",
         )})</div>
         <div class="callout-title">${escapeHtml(verdict.suggestedNextAction.action)}</div>
         <p class="callout-body">${escapeHtml(verdict.suggestedNextAction.rationale)}</p>
       </div>`
    : `<p class="muted">No recommended next action was available for this run.</p>`;

  const segmentsHtml =
    icp.segments.length > 0
      ? `<div class="cards">${icp.segments
          .map(
            (seg) => `
          <div class="card">
            <div class="card-title">${escapeHtml(seg.name)}</div>
            ${seg.description ? `<p class="card-desc">${escapeHtml(seg.description)}</p>` : ""}
            <div class="kv-grid">
              ${seg.industry ? `<div><span>Industry</span><strong>${escapeHtml(seg.industry)}</strong></div>` : ""}
              ${seg.companySize ? `<div><span>Company size</span><strong>${escapeHtml(seg.companySize)}</strong></div>` : ""}
              ${seg.buyerPersona ? `<div><span>Buyer</span><strong>${escapeHtml(seg.buyerPersona)}</strong></div>` : ""}
              ${seg.userPersona ? `<div><span>User</span><strong>${escapeHtml(seg.userPersona)}</strong></div>` : ""}
            </div>
            ${
              seg.jobsToBeDone.length > 0
                ? `<div class="sub-label">Jobs to be done</div><ul>${seg.jobsToBeDone
                    .map((j) => `<li>${escapeHtml(j)}</li>`)
                    .join("")}</ul>`
                : ""
            }
          </div>`,
          )
          .join("")}</div>`
      : "";

  const customerEvidenceHtml =
    icp.customerEvidence.length > 0
      ? `<table>
          <thead><tr><th>Customer Claim</th><th>Status</th><th>Evidence Quote</th></tr></thead>
          <tbody>${icp.customerEvidence
            .map(
              (ev) => `<tr>
              <td>${escapeHtml(ev.statement)}</td>
              <td><span class="${statusPillClass(ev.status)}">${escapeHtml(ev.status)}</span></td>
              <td>${ev.quote ? `&ldquo;${escapeHtml(ev.quote)}&rdquo;` : '<span class="muted">No quote linked</span>'}</td>
            </tr>`,
            )
            .join("")}</tbody>
        </table>`
      : `<p class="muted">No customer-specific claims were extracted in this run.</p>`;

  const competitorsHtml =
    comp.competitors.length > 0
      ? `<table>
          <thead>
            <tr>
              <th>Competitor</th>
              <th>Type</th>
              <th>Positioning &amp; Product</th>
              <th>Pricing</th>
              <th>Differentiation / Notes</th>
            </tr>
          </thead>
          <tbody>${comp.competitors
            .map((c) => {
              const safeSite = sanitizeHttpUrl(c.website);
              const nameCell = safeSite
                ? `<strong>${escapeHtml(c.name)}</strong><br/><a class="url" href="${escapeHtml(safeSite)}">${escapeHtml(safeSite)}</a>`
                : `<strong>${escapeHtml(c.name)}</strong>`;
              const posParts = [c.positioning, c.product, c.description].filter(Boolean);
              const diffParts = [
                c.differentiation,
                c.strengths.length > 0 ? `Strengths: ${c.strengths.join("; ")}` : null,
                c.limitations.length > 0 ? `Limitations: ${c.limitations.join("; ")}` : null,
              ].filter(Boolean);
              return `<tr>
                <td>${nameCell}</td>
                <td>${escapeHtml(c.kind)}</td>
                <td>${posParts.length > 0 ? escapeHtml(posParts.join(" — ")) : '<span class="muted">Not recorded</span>'}</td>
                <td>${c.pricing ? escapeHtml(c.pricing) : '<span class="muted">Not recorded</span>'}</td>
                <td>${diffParts.length > 0 ? escapeHtml(diffParts.join(" · ")) : '<span class="muted">Not recorded</span>'}</td>
              </tr>`;
            })
            .join("")}</tbody>
        </table>`
      : `<div class="empty-box">${escapeHtml(comp.summary)}</div>`;

  const scoreHtml = score.available
    ? `<div class="score-banner">
        <div class="score-stat">
          <span class="stat-label">Opportunity Score</span>
          <span class="stat-value">${score.overallScore !== null ? score.overallScore.toFixed(1) : "N/A"}<small>/10</small></span>
        </div>
        <div class="score-stat">
          <span class="stat-label">Evidence Coverage</span>
          <span class="stat-value">${formatPct(score.evidenceCoverage)}<small> ${escapeHtml(score.coverageAssessment)}</small></span>
        </div>
        <div class="score-stat">
          <span class="stat-label">Scoring Model</span>
          <span class="stat-meta">${escapeHtml(score.scoringModelVersion ?? "Unavailable")}</span>
        </div>
      </div>
      <div class="notice">${escapeHtml(score.uncertaintyNotice)}</div>
      ${
        score.dimensions.length > 0
          ? `<table>
              <thead><tr><th>Dimension</th><th>Score</th><th>Evidence Coverage</th><th>Cited Claims</th></tr></thead>
              <tbody>${score.dimensions
                .map(
                  (d) => `<tr>
                    <td>${escapeHtml(d.label)}</td>
                    <td><strong>${d.score.toFixed(1)}</strong> / 10</td>
                    <td>${formatPct(d.evidenceCoverage)}</td>
                    <td>${d.citedClaimIds.length}</td>
                  </tr>`,
                )
                .join("")}</tbody>
            </table>`
          : `<p class="muted">No individual dimension breakdowns were stored.</p>`
      }`
    : `<div class="empty-box">${escapeHtml(score.uncertaintyNotice)}</div>`;

  const sourcesHtml =
    app.sources.length > 0
      ? `<table>
          <thead><tr><th>Source</th><th>Type</th><th>Publisher</th><th>URL</th></tr></thead>
          <tbody>${app.sources
            .map((src) => {
              const safeUrl = sanitizeHttpUrl(src.url);
              return `<tr>
                <td>${escapeHtml(src.title ?? "Untitled source")}</td>
                <td>${escapeHtml(src.sourceType)}</td>
                <td>${escapeHtml(src.publisher ?? "Unknown")}</td>
                <td>${
                  safeUrl
                    ? `<a class="url" href="${escapeHtml(safeUrl)}">${escapeHtml(safeUrl)}</a>`
                    : `<span class="url">${escapeHtml(src.url)}</span>`
                }</td>
              </tr>`;
            })
            .join("")}</tbody>
        </table>`
      : `<p class="muted">No sources were recorded for this run.</p>`;

  const claimsHtml =
    app.claims.length > 0
      ? `<table>
          <thead><tr><th>Claim</th><th>Module</th><th>Origin</th><th>Status</th><th>Evidence</th></tr></thead>
          <tbody>${app.claims
            .map(
              (c) => `<tr>
                <td>${escapeHtml(c.statement)}</td>
                <td>${escapeHtml(c.module)}</td>
                <td>${escapeHtml(c.origin)}</td>
                <td><span class="${statusPillClass(c.status)}">${escapeHtml(c.status)}</span></td>
                <td>${c.evidenceCount}</td>
              </tr>`,
            )
            .join("")}</tbody>
        </table>`
      : `<p class="muted">No claims recorded.</p>`;

  const assumptionsHtml =
    app.assumptions.length > 0
      ? `<table>
          <thead><tr><th>Assumption</th><th>Type</th><th>Importance</th><th>Status</th></tr></thead>
          <tbody>${app.assumptions
            .map(
              (a) => `<tr>
                <td>${escapeHtml(a.statement)}</td>
                <td>${escapeHtml(a.type)}</td>
                <td>${escapeHtml(a.importance)}</td>
                <td><span class="${statusPillClass(a.status)}">${escapeHtml(a.status)}</span></td>
              </tr>`,
            )
            .join("")}</tbody>
        </table>`
      : `<p class="muted">No assumptions recorded.</p>`;

  const contradictionsHtml =
    app.contradictions.length > 0
      ? `<ul>${app.contradictions
          .map(
            (cc) =>
              `<li><strong>${escapeHtml(cc.claimStatement)}</strong> vs <strong>${escapeHtml(cc.contradictsStatement)}</strong>${cc.note ? ` — ${escapeHtml(cc.note)}` : ""}</li>`,
          )
          .join("")}</ul>`
      : `<p class="muted">No formal contradiction pairs recorded.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Quick Brief — ${escapeHtml(meta.ideaTitle)}</title>
  <style>
    @page {
      size: A4;
      margin: 18mm 14mm 20mm 14mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", sans-serif;
      color: #0f172a;
      background: #ffffff;
      font-size: 10.5pt;
      line-height: 1.5;
      margin: 0;
      padding: 0;
    }
    .header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .brand-bar {
      font-size: 8.5pt;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #3059f0;
      font-weight: 700;
      margin-bottom: 6px;
    }
    h1 {
      font-size: 20pt;
      line-height: 1.2;
      margin: 0 0 8px 0;
      color: #0f172a;
      break-after: avoid;
    }
    h2 {
      font-size: 13pt;
      line-height: 1.3;
      margin: 20px 0 8px 0;
      padding-bottom: 4px;
      border-bottom: 1px solid #cbd5e1;
      color: #0f172a;
      break-after: avoid;
    }
    h3 {
      font-size: 10.5pt;
      margin: 12px 0 6px 0;
      color: #1e293b;
      break-after: avoid;
    }
    p { margin: 0 0 8px 0; }
    ul { margin: 4px 0 10px 0; padding-left: 18px; }
    li { margin-bottom: 4px; break-inside: avoid; }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-top: 10px;
      font-size: 8.5pt;
      color: #334155;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
      break-inside: avoid;
    }
    .meta-grid span { display: block; color: #64748b; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em; }
    .meta-grid strong { color: #0f172a; font-weight: 600; word-break: break-word; }
    .verdict-chip {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 999px;
      background: #eef2ff;
      color: #1e40af;
      border: 1px solid #bfdbfe;
      font-weight: 700;
      font-size: 9.5pt;
      margin-bottom: 8px;
    }
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 8px;
    }
    .panel {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
      background: #ffffff;
      break-inside: avoid;
    }
    .callout {
      border-left: 4px solid #3059f0;
      background: #f8fafc;
      padding: 10px 12px;
      border-radius: 0 6px 6px 0;
      margin: 10px 0;
      break-inside: avoid;
    }
    .callout-label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em; color: #3059f0; font-weight: 700; }
    .callout-title { font-weight: 700; margin-top: 3px; }
    .callout-body { color: #334155; margin-top: 4px; font-size: 9.5pt; }
    .cards { display: grid; gap: 10px; margin-bottom: 10px; }
    .card {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
      break-inside: avoid;
    }
    .card-title { font-weight: 700; font-size: 10.5pt; }
    .card-desc { color: #475569; margin-top: 4px; }
    .kv-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      margin-top: 8px;
      font-size: 9pt;
    }
    .kv-grid span { display: block; font-size: 8pt; color: #64748b; }
    .sub-label { font-size: 8.5pt; font-weight: 700; color: #475569; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
    .score-banner {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 10px;
      break-inside: avoid;
    }
    .score-stat {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px 12px;
      background: #f8fafc;
    }
    .stat-label { display: block; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; }
    .stat-value { display: block; font-size: 18pt; font-weight: 700; color: #0f172a; margin-top: 2px; }
    .stat-value small { font-size: 9.5pt; font-weight: 500; color: #475569; }
    .stat-meta { display: block; font-size: 9.5pt; font-weight: 600; margin-top: 6px; }
    .notice {
      padding: 8px 10px;
      border-radius: 6px;
      background: #fffbeb;
      border: 1px solid #fde68a;
      color: #92400e;
      font-size: 9.5pt;
      margin-bottom: 10px;
      break-inside: avoid;
    }
    .empty-box {
      padding: 10px 12px;
      border: 1px dashed #cbd5e1;
      border-radius: 6px;
      color: #475569;
      background: #f8fafc;
      break-inside: avoid;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0 12px 0;
      font-size: 9pt;
      table-layout: fixed;
    }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      font-size: 8.5pt;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .pill {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 999px;
      font-size: 7.5pt;
      font-weight: 600;
      border: 1px solid #cbd5e1;
      white-space: nowrap;
    }
    .pill-positive { background: #ecfdf5; color: #065f46; border-color: #6ee7b7; }
    .pill-danger { background: #fef2f2; color: #991b1b; border-color: #fca5a5; }
    .pill-warn { background: #fffbeb; color: #92400e; border-color: #fcd34d; }
    .pill-accent { background: #eff6ff; color: #1d4ed8; border-color: #93c5fd; }
    .pill-muted { background: #f1f5f9; color: #475569; border-color: #cbd5e1; }
    .muted { color: #64748b; }
    a.url, span.url { color: #1d4ed8; font-size: 8pt; word-break: break-all; }
    .section { margin-bottom: 14px; }
  </style>
</head>
<body>
  <header class="header">
    <div class="brand-bar">Founder Intelligence · Quick Brief (v${report.version})</div>
    <h1>${escapeHtml(meta.ideaTitle)}</h1>
    <div class="meta-grid">
      <div><span>Workspace</span><strong>${escapeHtml(meta.workspaceName)}</strong></div>
      <div><span>Report Type</span><strong>${escapeHtml(meta.reportType)} · v${report.version}</strong></div>
      <div><span>Generated</span><strong>${escapeHtml(formatDate(report.createdAt))}</strong></div>
      <div><span>Geography</span><strong>${meta.geography.length > 0 ? escapeHtml(meta.geography.join(", ")) : "Not specified"}</strong></div>
      <div><span>Research Run</span><strong>${escapeHtml(meta.runDepth)} · ${escapeHtml(meta.runState)} (${escapeHtml(meta.runId.slice(0, 8))})</strong></div>
      <div><span>Stage / Category</span><strong>${escapeHtml(meta.ideaStage)}${meta.ideaCategory ? ` · ${escapeHtml(meta.ideaCategory)}` : ""}</strong></div>
    </div>
  </header>

  <section class="section">
    <h2>1. Executive Verdict</h2>
    <div class="verdict-chip">${escapeHtml(verdict.verdictLabel)}</div>
    <p>${escapeHtml(verdict.summary)}</p>
    ${nextActionHtml}
    <div class="two-col">
      <div class="panel">
        <h3>Key Strengths</h3>
        ${strengthsHtml}
      </div>
      <div class="panel">
        <h3>Key Risks</h3>
        ${risksHtml}
      </div>
    </div>
    <h3>Critical Uncertainties</h3>
    ${uncertaintiesHtml}
  </section>

  <section class="section">
    <h2>2. Ideal Customer Profile (ICP)</h2>
    <p>${escapeHtml(icp.summary)}</p>
    <p><strong>Primary target customer:</strong> ${icp.primaryCustomer ? escapeHtml(icp.primaryCustomer) : '<span class="muted">Not sufficiently established in latest run</span>'}</p>
    ${segmentsHtml}
    <div class="two-col">
      <div class="panel">
        <h3>Pain Points</h3>
        ${icp.painPoints.length > 0 ? `<ul>${icp.painPoints.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>` : '<p class="muted">None established.</p>'}
      </div>
      <div class="panel">
        <h3>Buying Motivations &amp; Objections</h3>
        ${
          icp.buyingMotivations.length > 0 || icp.objectionsAndRisks.length > 0
            ? `<ul>
                ${icp.buyingMotivations.map((m) => `<li><strong>Motivation:</strong> ${escapeHtml(m)}</li>`).join("")}
                ${icp.objectionsAndRisks.map((o) => `<li><strong>Risk / Objection:</strong> ${escapeHtml(o)}</li>`).join("")}
              </ul>`
            : '<p class="muted">No buying motivations or objections recorded.</p>'
        }
      </div>
    </div>
    <h3>Customer Evidence</h3>
    ${customerEvidenceHtml}
  </section>

  <section class="section">
    <h2>3. Competitive Landscape</h2>
    ${comp.alternativesSummary ? `<p><strong>Recorded alternatives:</strong> ${escapeHtml(comp.alternativesSummary)}</p>` : ""}
    ${comp.differentiationSummary ? `<p><strong>Intended differentiation:</strong> ${escapeHtml(comp.differentiationSummary)}</p>` : ""}
    ${competitorsHtml}
    ${
      comp.competitiveClaims.length > 0
        ? `<h3>Competitive Claims</h3><ul>${comp.competitiveClaims
            .map(
              (c) =>
                `<li>${escapeHtml(c.statement)} <span class="${statusPillClass(c.status)}">${escapeHtml(c.status)}</span></li>`,
            )
            .join("")}</ul>`
        : ""
    }
  </section>

  <section class="section">
    <h2>4. Opportunity Score &amp; Evidence Coverage</h2>
    ${scoreHtml}
  </section>

  <section class="section">
    <h2>5. Appendix &amp; Evidence Lineage</h2>
    <h3>Research Limitations</h3>
    ${
      app.researchLimitations.length > 0
        ? `<ul>${app.researchLimitations.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`
        : '<p class="muted">No major limitations recorded.</p>'
    }
    <h3>Claims Ledger (${app.claims.length})</h3>
    ${claimsHtml}
    <h3>Assumptions (${app.assumptions.length})</h3>
    ${assumptionsHtml}
    <h3>Contradictions (${app.contradictions.length})</h3>
    ${contradictionsHtml}
    <h3>Unknowns (${app.unknowns.length})</h3>
    ${
      app.unknowns.length > 0
        ? `<ul>${app.unknowns.map((u) => `<li>${escapeHtml(u)}</li>`).join("")}</ul>`
        : '<p class="muted">No unknowns recorded.</p>'
    }
    <h3>Sources (${app.sources.length})</h3>
    ${sourcesHtml}
  </section>
</body>
</html>`;
}

function resolveExecutablePath(): string | undefined {
  const configured = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  if (configured && fs.existsSync(configured)) {
    return configured;
  }
  const bundled = chromium.executablePath();
  if (bundled && fs.existsSync(bundled)) {
    return bundled;
  }
  const fallbacks = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ];
  return fallbacks.find((candidate) => fs.existsSync(candidate));
}

export async function renderQuickBriefPdf(
  report: QuickBriefReport,
): Promise<Buffer> {
  const html = renderQuickBriefHtml(report);
  const executablePath = resolveExecutablePath();
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

    context = await browser.newContext({
      javaScriptEnabled: false,
      offline: true,
      serviceWorkers: "block",
      acceptDownloads: false,
    });

    const page = await context.newPage();
    page.setDefaultTimeout(PDF_TIMEOUT_MS);
    // Defense-in-depth: block any external network or file:// navigation/requests.
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url === "about:blank") {
        return route.continue();
      }
      return route.abort();
    });

    await page.setContent(html, {
      waitUntil: "load",
      timeout: PDF_TIMEOUT_MS,
    });

    const headerTitle = escapeHtml(report.sections.metadata.ideaTitle);
    const generatedAt = escapeHtml(formatDate(report.createdAt));

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      margin: {
        top: "18mm",
        right: "14mm",
        bottom: "20mm",
        left: "14mm",
      },
      headerTemplate: `<div style="width:100%;font-size:8px;color:#64748b;padding:0 14mm;display:flex;justify-content:space-between;font-family:sans-serif;"><span>Founder Intelligence · Quick Brief</span><span>${headerTitle}</span></div>`,
      footerTemplate: `<div style="width:100%;font-size:8px;color:#64748b;padding:0 14mm;display:flex;justify-content:space-between;font-family:sans-serif;"><span>Generated ${generatedAt}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    });

    return Buffer.from(pdf);
  } catch (err) {
    logger.error({ err, reportId: report.id }, "Playwright PDF generation failed");
    throw new HttpError(
      500,
      "pdf_generation_failed",
      "Could not generate PDF report",
    );
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
