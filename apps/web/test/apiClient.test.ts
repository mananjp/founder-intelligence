import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  apiFetch,
  apiFetchBlob,
  ApiError,
  parseFilenameFromDisposition,
} from "../src/lib/apiClient";

describe("apiClient", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns parsed json on 200 OK", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ data: [{ id: "123", title: "Idea 1" }] }),
    });

    const res = await apiFetch<{ data: Array<{ id: string; title: string }> }>("/v1/workspaces/w1/ideas");
    expect(res.data[0].title).toBe("Idea 1");
  });

  it("throws typed ApiError with status, code, requestId, and details on error response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: {
        get: (h: string) => (h === "x-request-id" ? "req-abc-123" : null),
      },
      json: vi.fn().mockResolvedValue({
        error: {
          code: "VALIDATION_ERROR",
          message: "Field title is required",
          requestId: "req-abc-123",
          details: [{ field: "title" }],
        },
      }),
    });

    try {
      await apiFetch("/v1/workspaces/w1/ideas");
      expect.fail("Should have thrown ApiError");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(400);
      expect(apiErr.code).toBe("VALIDATION_ERROR");
      expect(apiErr.message).toBe("Field title is required");
      expect(apiErr.requestId).toBe("req-abc-123");
      expect(apiErr.details).toEqual([{ field: "title" }]);
    }
  });

  it("handles 401 unauthorized and calls onUnauthorized callback", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => null },
      json: vi.fn().mockResolvedValue({
        error: { code: "UNAUTHORIZED", message: "Token expired" },
      }),
    });

    const onUnauthorized = vi.fn();

    await expect(
      apiFetch("/v1/workspaces/w1/ideas", { onUnauthorized }),
    ).rejects.toThrow("Token expired");

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("times out and maps to 408 TIMEOUT ApiError", async () => {
    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      return new Promise((_, reject) => {
        if (init?.signal) {
          init.signal.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    });

    try {
      await apiFetch("/v1/workspaces/w1/ideas", { timeoutMs: 50 });
      expect.fail("Should have timed out");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(408);
      expect(apiErr.code).toBe("TIMEOUT");
      expect(apiErr.message).toContain("timed out after 50ms");
    }
  });

  it("downloads binary blobs and parses Content-Disposition filenames", async () => {
    const fakeBlob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (h: string) =>
          h.toLowerCase() === "content-disposition"
            ? 'attachment; filename="fi-quick-brief-v1.pdf"'
            : null,
      },
      blob: vi.fn().mockResolvedValue(fakeBlob),
    });

    const result = await apiFetchBlob(
      "/v1/workspaces/w1/ideas/i1/reports/r1/pdf",
      { token: "jwt-123" },
    );

    expect(result.filename).toBe("fi-quick-brief-v1.pdf");
    expect(result.blob).toBe(fakeBlob);
    expect(parseFilenameFromDisposition(null)).toBeUndefined();
    expect(parseFilenameFromDisposition(undefined)).toBeUndefined();
    expect(parseFilenameFromDisposition("")).toBeUndefined();
  });

  it("parses valid Content-Disposition variants and safely rejects malformed or unsafe filenames", async () => {
    expect(
      parseFilenameFromDisposition(
        'attachment; filename="fi-quick-brief-ai-copilot-v2.pdf"',
      ),
    ).toBe("fi-quick-brief-ai-copilot-v2.pdf");
    expect(
      parseFilenameFromDisposition(
        "attachment; filename=fi-quick-brief-v2.pdf; size=4200",
      ),
    ).toBe("fi-quick-brief-v2.pdf");
    expect(
      parseFilenameFromDisposition(
        "attachment; filename*=UTF-8''fi-quick-brief%20v3.pdf; filename=\"fallback.pdf\"",
      ),
    ).toBe("fi-quick-brief v3.pdf");

    // Malformed, traversal, control-character, and spoofed values must return undefined.
    expect(parseFilenameFromDisposition('attachment; filename=""')).toBeUndefined();
    expect(
      parseFilenameFromDisposition('attachment; filename="   "'),
    ).toBeUndefined();
    expect(
      parseFilenameFromDisposition('attachment; filename="unclosed.pdf'),
    ).toBeUndefined();
    expect(
      parseFilenameFromDisposition('attachment; filename="../../etc/passwd"'),
    ).toBeUndefined();
    expect(
      parseFilenameFromDisposition('attachment; filename="dir\\evil.pdf"'),
    ).toBeUndefined();
    expect(
      parseFilenameFromDisposition('attachment; filename=".."'),
    ).toBeUndefined();
    expect(
      parseFilenameFromDisposition('attachment; filename="bad\u0007name.pdf"'),
    ).toBeUndefined();
    expect(
      parseFilenameFromDisposition("attachment; filename*=UTF-8''%ZZ"),
    ).toBeUndefined();
    expect(
      parseFilenameFromDisposition('attachment; xfilename="spoof.pdf"'),
    ).toBeUndefined();

    // Missing Content-Disposition returns undefined so caller keeps fallback filename.
    const fakeBlob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      blob: vi.fn().mockResolvedValue(fakeBlob),
    });

    const withoutHeader = await apiFetchBlob(
      "/v1/workspaces/w1/ideas/i1/reports/r1/pdf",
      { token: "jwt-123" },
    );
    expect(withoutHeader.filename).toBeUndefined();
    expect(withoutHeader.blob).toBe(fakeBlob);
  });
});
