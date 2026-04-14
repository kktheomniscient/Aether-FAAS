const AUTH_STORAGE_KEY = "aether.auth.session";

export type AuthSession = {
  token: string;
  email: string;
};

export function getApiBaseUrl(): string {
  const rawBaseUrl =
    import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
  return rawBaseUrl.replace(/\/+$/, "");
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getAuthSession(): AuthSession | null {
  if (!isBrowser()) {
    return null;
  }

  const value = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<AuthSession>;
    if (typeof parsed.token === "string" && typeof parsed.email === "string") {
      return { token: parsed.token, email: parsed.email };
    }
  } catch {
    // Corrupt session should not block auth flow.
  }

  return null;
}

export function getAuthToken(): string | null {
  return getAuthSession()?.token ?? null;
}

export function setAuthSession(session: AuthSession): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearAuthSession(): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}
