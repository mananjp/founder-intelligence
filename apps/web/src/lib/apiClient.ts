import { env } from "./env";

/** Thin fetch wrapper. All routes are workspace-scoped: /v1/workspaces/:workspaceId/... */
export async function apiFetch<T>(path: string, init?: RequestInit & { token?: string }): Promise<T> {
  const res = await fetch(`${env.apiUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.token ? { Authorization: `Bearer ${init.token}` } : {}), ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `API error ${res.status}`);
  }
  return res.json();
}
