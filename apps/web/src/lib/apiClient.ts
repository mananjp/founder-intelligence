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
const DEFAULT_BLOB_TIMEOUT_MS = 45000;

async function performRequest(
  path: string,
  init: ApiFetchOptions | undefined,
  defaultTimeoutMs: number,
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? defaultTimeoutMs;
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

    return res;
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

/** Thin fetch wrapper. All routes are workspace-scoped: /v1/workspaces/:workspaceId/... */
export async function apiFetch<T>(
  path: string,
  init?: ApiFetchOptions,
): Promise<T> {
  const res = await performRequest(path, init, DEFAULT_TIMEOUT_MS);
  return (await res.json()) as T;
}

function sanitizeParsedFilename(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "." || trimmed === "..") return undefined;
  for (let i = 0; i < trimmed.length; i += 1) {
    const code = trimmed.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return undefined;
  }
  if (
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("..")
  ) {
    return undefined;
  }
  return trimmed;
}

export function parseFilenameFromDisposition(
  header: string | null | undefined,
): string | undefined {
  if (!header || typeof header !== "string") return undefined;

  // Prefer RFC 5987/6266 extended parameter: filename*=UTF-8''encoded-name.pdf
  const extMatch = header.match(/(?:^|[;\s])filename\*\s*=\s*([^;\r\n]+)/i);
  if (extMatch?.[1]) {
    const rawExt = extMatch[1].trim();
    const rfc5987 = rawExt.match(/^([^']*)'[^']*'(.*)$/);
    const encoded = rfc5987?.[2];
    if (
      rfc5987 &&
      encoded !== undefined &&
      (!rfc5987[1] || rfc5987[1].toLowerCase() === "utf-8")
    ) {
      try {
        return sanitizeParsedFilename(decodeURIComponent(encoded));
      } catch {
        return undefined;
      }
    }
  }

  const quotedMatch = header.match(
    /(?:^|[;\s])filename\s*=\s*"([^"\r\n]*)"/i,
  );
  if (quotedMatch?.[1] !== undefined) {
    return sanitizeParsedFilename(quotedMatch[1]);
  }

  const unquotedMatch = header.match(
    /(?:^|[;\s])filename\s*=\s*([^;"\r\n]+)(?=$|;)/i,
  );
  if (unquotedMatch?.[1] !== undefined) {
    return sanitizeParsedFilename(unquotedMatch[1]);
  }

  return undefined;
}

/** Fetch binary responses (such as Playwright PDF exports) with uniform ApiError handling. */
export async function apiFetchBlob(
  path: string,
  init?: ApiFetchOptions,
): Promise<{ blob: Blob; filename?: string }> {
  const res = await performRequest(
    path,
    {
      ...init,
      headers: {
        Accept: "application/pdf",
        ...init?.headers,
      },
    },
    DEFAULT_BLOB_TIMEOUT_MS,
  );
  const blob = await res.blob();
  const filename = parseFilenameFromDisposition(
    res.headers.get("content-disposition"),
  );
  return { blob, filename };
}
