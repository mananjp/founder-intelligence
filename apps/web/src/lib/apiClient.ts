import { env } from "./env";

export interface ApiErrorPayload {
  status: number;
  code: string;
  message: string;
  requestId?: string;
  details?: unknown;
}

export class ApiError extends Error implements ApiErrorPayload {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = "ApiError";
    this.status = payload.status;
    this.code = payload.code;
    this.requestId = payload.requestId;
    this.details = payload.details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export interface ApiFetchOptions extends RequestInit {
  token?: string;
  timeoutMs?: number;
  onUnauthorized?: () => void;
}

const DEFAULT_TIMEOUT_MS = 15000;

/** Thin fetch wrapper. All routes are workspace-scoped: /v1/workspaces/:workspaceId/... */
export async function apiFetch<T>(
  path: string,
  init?: ApiFetchOptions,
): Promise<T> {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  if (init?.signal) {
    init.signal.addEventListener("abort", () => {
      controller.abort(init.signal?.reason);
    });
  }

  try {
    const res = await fetch(`${env.apiUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...init?.headers,
      },
    });

    if (!res.ok) {
      const requestIdHeader = res.headers.get("x-request-id") ?? undefined;
      const body = await res.json().catch(() => ({}));
      const errorObj = body?.error;

      const apiError = new ApiError({
        status: res.status,
        code: errorObj?.code ?? `HTTP_${res.status}`,
        message: errorObj?.message ?? body?.message ?? `API error ${res.status}`,
        requestId: errorObj?.requestId ?? requestIdHeader,
        details: errorObj?.details ?? body?.details,
      });

      if (res.status === 401) {
        if (init?.onUnauthorized) {
          init.onUnauthorized();
        } else if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
      }

      throw apiError;
    }

    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError({
        status: 408,
        code: "TIMEOUT",
        message: `Request timed out after ${timeoutMs}ms`,
      });
    }
    throw err;
  } finally {
    clearTimeout(timeoutTimer);
  }
}
