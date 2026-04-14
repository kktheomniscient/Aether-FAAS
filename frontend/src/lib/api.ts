import { getApiBaseUrl } from "@/lib/auth";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  token?: string;
  body?: unknown;
};

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", token, body } = options;
  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as
    | { detail?: string }
    | T
    | null;

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "detail" in payload &&
      typeof payload.detail === "string"
        ? payload.detail
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export type AuthPayload = {
  email: string;
  password: string;
};

export type SignInResponse = {
  access_token: string;
  token_type: string;
  email?: string;
};

export type SessionResponse = {
  email: string;
};

export function signUp(
  payload: AuthPayload,
): Promise<{ email: string; status: string }> {
  return request("/auth/signup", { method: "POST", body: payload });
}

export function signIn(payload: AuthPayload): Promise<SignInResponse> {
  return request("/auth/signin", { method: "POST", body: payload });
}

export function signOut(token: string): Promise<{ status: string }> {
  return request("/auth/signout", { method: "POST", token });
}

export function getMe(token: string): Promise<SessionResponse> {
  return request("/auth/me", { token });
}
