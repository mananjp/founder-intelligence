"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  QuickBriefReport,
  type Report,
  type ResearchRun,
} from "@fi/contracts";
import { ApiError, apiFetch, apiFetchBlob } from "@/lib/apiClient";
import {
  clearStoredAccessToken,
  getStoredAccessToken,
  setStoredAccessToken,
} from "@/lib/authToken";
import { showToast } from "@/lib/toast";
import { ErrorBanner, LoadingState } from "@/components/WorkspaceState";
import { QuickBriefDocument } from "./QuickBriefDocument";
import "./reports.css";

function mapUserErrorMessage(err: unknown): {
  title: string;
  message: string;
  requestId?: string;
} {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return {
        title: "Authentication required",
        message: "Sign in to view, generate, and export reports.",
        requestId: err.requestId,
      };
    }
    if (err.status === 403) {
      return {
        title: "Permission required",
        message:
          "Your workspace role cannot perform this action. Ask a workspace owner or member for access.",
        requestId: err.requestId,
      };
    }
    if (err.code === "no_research_runs" || err.code === "no_valid_research_run") {
      return {
        title: "No completed research run yet",
        message: err.message,
        requestId: err.requestId,
      };
    }
    if (err.code === "pdf_generation_failed") {
      return {
        title: "PDF export failed",
        message:
          "We could not render the PDF for this brief. Please try again in a moment.",
        requestId: err.requestId,
      };
    }
    if (err.status >= 500) {
      return {
        title: "Something went wrong on our side",
        message: "We could not complete your request. Please try again.",
        requestId: err.requestId,
      };
    }
    return {
      title: "Report request could not be completed",
      message: err.message,
      requestId: err.requestId,
    };
  }

  return {
    title: "Connection unavailable",
    message:
      "We could not reach the Founder Intelligence API. Verify the API server is running and try again.",
  };
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function ReportsWorkspace() {
  const params = useParams<{ workspaceId: string; ideaId: string }>();
  const workspaceId = params.workspaceId;
  const ideaId = params.ideaId;

  const [reports, setReports] = useState<Report[]>([]);
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [devTokenInput, setDevTokenInput] = useState("");
  const [errorState, setErrorState] = useState<{
    title: string;
    message: string;
    requestId?: string;
  } | null>(null);

  const loadReportsAndRuns = useCallback(async () => {
    if (!workspaceId || !ideaId) return;

    const token = getStoredAccessToken();
    try {
      setLoading(true);
      setErrorState(null);
      setAuthRequired(false);

      const [reportsRes, runsRes] = await Promise.all([
        apiFetch<{ data: Report[] }>(
          `/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports`,
          {
            token,
            onUnauthorized: () => {
              setAuthRequired(true);
            },
          },
        ),
        apiFetch<{ data: ResearchRun[] }>(
          `/v1/workspaces/${workspaceId}/ideas/${ideaId}/research/runs`,
          {
            token,
            onUnauthorized: () => {
              setAuthRequired(true);
            },
          },
        ),
      ]);

      setReports(reportsRes.data);
      setRuns(runsRes.data);
      setSelectedReportId((prev) => {
        if (prev && reportsRes.data.some((r) => r.id === prev)) return prev;
        return reportsRes.data[0]?.id ?? null;
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthRequired(true);
        return;
      }
      setErrorState(mapUserErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, ideaId]);

  useEffect(() => {
    void loadReportsAndRuns();
  }, [loadReportsAndRuns]);

  const latestCompletedRun = useMemo(
    () => runs.find((run) => run.state === "completed") ?? null,
    [runs],
  );

  const latestRun = runs[0] ?? null;

  const selectedReport = useMemo(
    () =>
      reports.find((report) => report.id === selectedReportId) ??
      reports[0] ??
      null,
    [reports, selectedReportId],
  );

  const parsedQuickBrief = useMemo(() => {
    if (!selectedReport || selectedReport.kind !== "quick_brief") return null;
    const parsed = QuickBriefReport.safeParse(selectedReport);
    return parsed.success ? parsed.data : null;
  }, [selectedReport]);

  const handleGenerate = async (force: boolean) => {
    if (!workspaceId || !ideaId) return;
    const token = getStoredAccessToken();
    try {
      setGenerating(true);
      setErrorState(null);

      const response = await apiFetch<{ data: Report }>(
        `/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports`,
        {
          method: "POST",
          token,
          body: JSON.stringify({ kind: "quick_brief", force }),
          onUnauthorized: () => {
            setAuthRequired(true);
          },
        },
      );

      const created = response.data;
      setReports((prev) => {
        const filtered = prev.filter((item) => item.id !== created.id);
        return [created, ...filtered];
      });
      setSelectedReportId(created.id);
      showToast(
        force
          ? `Generated quick brief v${created.version}.`
          : `Quick brief v${created.version} ready.`,
        "success",
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthRequired(true);
        return;
      }
      const mapped = mapUserErrorMessage(err);
      setErrorState(mapped);
      showToast(mapped.message, "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleExportPdf = async () => {
    if (!workspaceId || !ideaId || !selectedReport) return;
    const token = getStoredAccessToken();
    try {
      setExportingPdf(true);
      setErrorState(null);

      const { blob, filename } = await apiFetchBlob(
        `/v1/workspaces/${workspaceId}/ideas/${ideaId}/reports/${selectedReport.id}/pdf`,
        {
          token,
          onUnauthorized: () => {
            setAuthRequired(true);
          },
        },
      );

      const downloadName =
        filename ?? `fi-quick-brief-v${selectedReport.version}.pdf`;
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = downloadName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);

      showToast(`Downloaded ${downloadName}.`, "success");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthRequired(true);
        return;
      }
      const mapped = mapUserErrorMessage(err);
      setErrorState(mapped);
      showToast(mapped.message, "error");
    } finally {
      setExportingPdf(false);
    }
  };

  const handleApplyDevToken = (event: React.FormEvent) => {
    event.preventDefault();
    if (!devTokenInput.trim()) return;
    setStoredAccessToken(devTokenInput);
    setDevTokenInput("");
    void loadReportsAndRuns();
  };

  return (
    <main className="fi-reports-shell">
      <nav aria-label="Breadcrumb" className="fi-reports-breadcrumb">
        <Link href={`/workspace/${workspaceId}`}>Workspace</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/workspace/${workspaceId}/ideas`}>Ideas</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/workspace/${workspaceId}/ideas/${ideaId}`}>
          Intelligence Home
        </Link>
        <span aria-hidden="true">/</span>
        <span>Reports</span>
      </nav>

      <header className="fi-reports-hero">
        <div>
          <p className="fi-reports-eyebrow">Monitoring &amp; Output · Quick Brief</p>
          <h1 className="fi-reports-title">Research Reports</h1>
          <p className="fi-reports-subtitle">
            Evidence-linked executive quick briefs generated from the latest
            completed research run and exportable to PDF via Playwright.
          </p>
        </div>

        <div className="fi-reports-actions">
          <Link
            href={`/workspace/${workspaceId}/ideas/${ideaId}`}
            className="fi-btn-secondary"
          >
            Back to idea
          </Link>
          <Link
            href={`/workspace/${workspaceId}/ideas/${ideaId}/research-live`}
            className="fi-btn-secondary"
          >
            Research runs
          </Link>
          <button
            type="button"
            className="fi-btn-primary"
            disabled={generating || authRequired || !latestCompletedRun}
            onClick={() => void handleGenerate(reports.length > 0)}
          >
            {generating
              ? "Generating brief..."
              : reports.length > 0
                ? "Regenerate quick brief"
                : "Generate quick brief"}
          </button>
          {parsedQuickBrief ? (
            <button
              type="button"
              className="fi-btn-secondary"
              disabled={exportingPdf}
              onClick={() => void handleExportPdf()}
            >
              {exportingPdf ? "Rendering PDF..." : "Export PDF"}
            </button>
          ) : null}
        </div>
      </header>

      {loading ? (
        <div aria-busy="true" role="status" style={{ display: "grid", gap: 16 }}>
          <LoadingState label="Loading reports and latest research run..." />
          <div className="fi-skeleton-block" style={{ height: 140 }} />
          <div className="fi-skeleton-block" style={{ height: 220 }} />
        </div>
      ) : null}

      {!loading && authRequired ? (
        <section
          className="fi-report-section"
          role="region"
          aria-label="Authentication required"
        >
          <h2 style={{ margin: 0 }}>Sign in to access reports</h2>
          <p style={{ margin: 0, color: "var(--fi-muted)" }}>
            Workspace reports require an authenticated session. Sign in or
            provide an active session bearer token for local testing.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/login" className="fi-btn-primary">
              Go to Sign in
            </Link>
            <button
              type="button"
              className="fi-btn-secondary"
              onClick={() => {
                clearStoredAccessToken();
                void loadReportsAndRuns();
              }}
            >
              Retry
            </button>
          </div>
          <form
            onSubmit={handleApplyDevToken}
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              marginTop: 8,
            }}
          >
            <input
              type="password"
              value={devTokenInput}
              onChange={(e) => setDevTokenInput(e.target.value)}
              placeholder="Paste bearer JWT for local session"
              aria-label="Bearer JWT token"
              style={{
                flex: "1 1 260px",
                minHeight: 40,
                padding: "8px 12px",
                borderRadius: "var(--fi-radius)",
                border: "1px solid var(--fi-border-input)",
                background: "var(--fi-overlay)",
                color: "var(--fi-text)",
              }}
            />
            <button type="submit" className="fi-btn-secondary">
              Use session token
            </button>
          </form>
        </section>
      ) : null}

      {!loading && errorState ? (
        <div style={{ marginBottom: 20 }}>
          <ErrorBanner
            title={errorState.title}
            message={
              errorState.requestId
                ? `${errorState.message} (Reference: ${errorState.requestId})`
                : errorState.message
            }
            onRetry={() => void loadReportsAndRuns()}
          />
        </div>
      ) : null}

      {!loading && !authRequired && !latestCompletedRun ? (
        <section className="fi-report-section" style={{ marginBottom: 20 }}>
          <div className="fi-section-header">
            <h2>
              {latestRun
                ? "Latest research run is not completed"
                : "No research runs yet"}
            </h2>
            {latestRun ? (
              <span className="fi-verdict-pill">
                Latest run: {latestRun.state}
              </span>
            ) : null}
          </div>
          <p style={{ margin: 0, color: "var(--fi-muted)" }}>
            {latestRun
              ? `Quick briefs can only be generated from a completed research run. The latest run (${latestRun.id.slice(0, 8)}) is currently "${latestRun.state}".`
              : "Quick briefs synthesize evidence, ICP signals, competitors, and opportunity score from a completed research run. Run research first to generate your first brief."}
          </p>
          <div className="fi-reports-actions">
            <Link
              href={`/workspace/${workspaceId}/ideas/${ideaId}/research-setup`}
              className="fi-btn-primary"
            >
              Set up research
            </Link>
            <Link
              href={`/workspace/${workspaceId}/ideas/${ideaId}/research-live`}
              className="fi-btn-secondary"
            >
              View research status
            </Link>
          </div>
        </section>
      ) : null}

      {!loading && !authRequired && reports.length === 0 && latestCompletedRun ? (
        <section className="fi-report-section">
          <div className="fi-section-header">
            <h2>Ready to generate your Quick Brief</h2>
            <span className="fi-verdict-pill">
              Completed run: {latestCompletedRun.depth} (
              {latestCompletedRun.id.slice(0, 8)})
            </span>
          </div>
          <p style={{ margin: 0, color: "var(--fi-muted)" }}>
            Generate a structured Quick Brief combining Executive Verdict, ICP,
            Competitive Landscape, Opportunity Score with Evidence Coverage, and
            full Evidence Appendix from your latest completed run.
          </p>
          <div>
            <button
              type="button"
              className="fi-btn-primary"
              disabled={generating}
              onClick={() => void handleGenerate(false)}
            >
              {generating ? "Generating brief..." : "Generate quick brief"}
            </button>
          </div>
        </section>
      ) : null}

      {!loading && !authRequired && selectedReport ? (
        <div className="fi-reports-layout">
          <aside className="fi-reports-rail" aria-label="Report navigation">
            <div className="fi-rail-card">
              <h3 className="fi-rail-heading">Sections</h3>
              <nav className="fi-reports-nav">
                <a href="#section-metadata">Report Metadata</a>
                <a href="#section-verdict">1. Executive Verdict</a>
                <a href="#section-icp">2. Ideal Customer Profile</a>
                <a href="#section-competitors">3. Competitive Landscape</a>
                <a href="#section-score">4. Opportunity Score</a>
                <a href="#section-appendix">5. Appendix &amp; Sources</a>
              </nav>
            </div>

            <div className="fi-rail-card">
              <h3 className="fi-rail-heading">Saved Versions ({reports.length})</h3>
              <div className="fi-version-list">
                {reports.map((report) => {
                  const active = report.id === selectedReport.id;
                  return (
                    <button
                      key={report.id}
                      type="button"
                      className={`fi-version-btn${active ? " is-active" : ""}`}
                      onClick={() => setSelectedReportId(report.id)}
                    >
                      <strong>
                        {report.kind} · v{report.version}
                      </strong>
                      <span
                        style={{
                          fontSize: "var(--fi-text-xs)",
                          color: "var(--fi-muted)",
                        }}
                      >
                        {formatShortDate(report.createdAt)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="fi-rail-card">
              <h3 className="fi-rail-heading">Related Views</h3>
              <nav className="fi-reports-nav">
                <Link href={`/workspace/${workspaceId}/ideas/${ideaId}/evidence`}>
                  Evidence Vault
                </Link>
                <Link href={`/workspace/${workspaceId}/ideas/${ideaId}/scorecard`}>
                  Scorecard
                </Link>
                <Link href={`/workspace/${workspaceId}/ideas/${ideaId}/history`}>
                  Research History
                </Link>
              </nav>
            </div>
          </aside>

          <div>
            {parsedQuickBrief ? (
              <QuickBriefDocument report={parsedQuickBrief} />
            ) : (
              <section className="fi-report-section">
                <h2>
                  {selectedReport.kind} · v{selectedReport.version}
                </h2>
                <p style={{ margin: 0, color: "var(--fi-muted)" }}>
                  This saved report uses a legacy or non-quick_brief format.
                  Generate a new quick brief from the latest completed run to
                  view all structured sections and export a PDF.
                </p>
              </section>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}

