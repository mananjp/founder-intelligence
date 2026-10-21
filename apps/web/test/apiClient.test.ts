import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiFetch, ApiError } from "../src/lib/apiClient";

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
});
