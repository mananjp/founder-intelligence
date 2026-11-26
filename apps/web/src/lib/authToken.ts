const DEV_TOKEN_STORAGE_KEY = "fi_access_token";

/**
 * Reads an active JWT from browser storage (dev token or Supabase Auth session)
 * so workspace pages can authenticate API calls cleanly.
 */
export function getStoredAccessToken(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const sessionToken = window.sessionStorage.getItem(DEV_TOKEN_STORAGE_KEY);
    if (sessionToken && sessionToken.trim()) {
      return sessionToken.trim();
    }

    const localToken = window.localStorage.getItem(DEV_TOKEN_STORAGE_KEY);
    if (localToken && localToken.trim()) {
      return localToken.trim();
    }

    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith("sb-") || !key.endsWith("-auth-token")) {
        continue;
      }
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { access_token?: unknown };
      if (
        typeof parsed?.access_token === "string" &&
        parsed.access_token.trim()
      ) {
        return parsed.access_token.trim();
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function setStoredAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  const trimmed = token.trim();
  if (!trimmed) {
    window.sessionStorage.removeItem(DEV_TOKEN_STORAGE_KEY);
    return;
  }
  window.sessionStorage.setItem(DEV_TOKEN_STORAGE_KEY, trimmed);
}

export function clearStoredAccessToken(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(DEV_TOKEN_STORAGE_KEY);
}

