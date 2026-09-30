import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EmptyIdeasState,
  ErrorBanner,
  LoadingState,
} from "../src/components/WorkspaceState";

describe("workspace state patterns", () => {
  it("renders a loading message with progress semantics", () => {
    const html = renderToStaticMarkup(<LoadingState label="Loading workspace..." />);

    expect(html).toContain("Loading workspace...");
    expect(html).toContain('role="status"');
  });

  it("renders an alert banner with retry affordance", () => {
    const html = renderToStaticMarkup(
      <ErrorBanner
        title="Ideas unavailable"
        message="Something went wrong while loading your ideas."
        onRetry={() => {}}
      />,
    );

    expect(html).toContain("Ideas unavailable");
    expect(html).toContain("Try again");
    expect(html).toContain('role="alert"');
  });

  it("renders an empty-state CTA for first-time users", () => {
    const html = renderToStaticMarkup(
      <EmptyIdeasState
        workspaceId="workspace-123"
        title="No ideas yet"
        description="Add an idea and FI will build the evidence behind it."
      />,
    );

    expect(html).toContain("No ideas yet");
    expect(html).toContain("Add your first idea");
    expect(html).toContain("/workspace/workspace-123/ideas/new");
  });
});
