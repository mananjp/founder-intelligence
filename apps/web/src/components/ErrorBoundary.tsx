"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import Link from "next/link";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          style={{
            minHeight: "40vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
            textAlign: "center",
          }}
        >
          <div
            style={{
              padding: 32,
              maxWidth: 540,
              width: "100%",
              borderRadius: "var(--fi-radius, 8px)",
              background: "var(--fi-surface, #1e293b)",
              border: "1px solid var(--fi-border, #334155)",
              color: "var(--fi-text, #f8fafc)",
            }}
          >
            <h2 style={{ margin: "0 0 12px 0", fontSize: 22 }}>
              Something went wrong
            </h2>
            <p
              style={{
                margin: "0 0 20px 0",
                color: "var(--fi-muted, #94a3b8)",
                fontSize: 14,
              }}
            >
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  padding: "8px 16px",
                  borderRadius: "var(--fi-radius, 8px)",
                  background: "var(--fi-accent, #3b82f6)",
                  color: "var(--fi-on-accent, #ffffff)",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Try again
              </button>
              <Link
                href="/"
                style={{
                  padding: "8px 16px",
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
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
