import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ErrorBoundary } from "../src/components/ErrorBoundary";

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    const html = renderToStaticMarkup(
      <ErrorBoundary>
        <div>Component loaded normally</div>
      </ErrorBoundary>,
    );

    expect(html).toContain("Component loaded normally");
  });

  it("renders fallback UI when hasError state is true", () => {
    const boundary = new ErrorBoundary({
      children: <div>Child</div>,
    });
    boundary.state = {
      hasError: true,
      error: new Error("Test error failure"),
    };

    const rendered = boundary.render() as React.ReactElement;
    const html = renderToStaticMarkup(rendered);

    expect(html).toContain('role="alert"');
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Test error failure");
    expect(html).toContain("Try again");
  });

  it("renders custom fallback when provided", () => {
    const boundary = new ErrorBoundary({
      children: <div>Child</div>,
      fallback: <div>Custom fallback message</div>,
    });
    boundary.state = {
      hasError: true,
      error: new Error("Test error failure"),
    };

    const rendered = boundary.render() as React.ReactElement;
    const html = renderToStaticMarkup(rendered);

    expect(html).toContain("Custom fallback message");
  });

  it("getDerivedStateFromError updates state", () => {
    const err = new Error("Boom");
    const nextState = ErrorBoundary.getDerivedStateFromError(err);
    expect(nextState).toEqual({ hasError: true, error: err });
  });
});
