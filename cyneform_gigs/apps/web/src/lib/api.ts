import type { ApiErrorBody, AuthSession } from "@cyneform/types";

const BASE = "/api/v1";

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;
  constructor(status: number, body: ApiErrorBody["error"]) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.fields = body.fields;
  }
}

export const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";

let accessToken: string | null = null;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

/** Called when the session can no longer be renewed, so the app can send the user to sign in. */
let onSessionLost: () => void = () => {};
export const setSessionLostHandler = (fn: () => void) => {
  onSessionLost = fn;
};

let refreshing: Promise<AuthSession | null> | null = null;
/** One refresh at a time: concurrent callers share the same request. */
export function refreshSession(): Promise<AuthSession | null> {
  refreshing ??= fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  })
    .then(async (res) => {
      if (!res.ok) return null;
      const session = (await res.json()) as AuthSession;
      accessToken = session.accessToken;
      return session;
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

interface Options {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  blob?: boolean;
}

export async function api<T>(
  path: string,
  { method = "GET", body, blob = false }: Options = {},
): Promise<T> {
  const form = typeof FormData !== "undefined" && body instanceof FormData;
  const send = () =>
    fetch(`${BASE}${path}`, {
      method,
      credentials: "include",
      headers: {
        ...(body !== undefined && !form ? { "content-type": "application/json" } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body !== undefined ? (form ? (body as FormData) : JSON.stringify(body)) : undefined,
    });

  let res = await send();

  if (res.status === 401 && accessToken) {
    const problem = (await res
      .clone()
      .json()
      .catch(() => null)) as ApiErrorBody | null;
    if (problem?.error.code === "TOKEN_EXPIRED" && (await refreshSession())) {
      res = await send();
    } else if (problem?.error.code !== "INVALID_CREDENTIALS") {
      setAccessToken(null);
      onSessionLost();
    }
  }

  if (res.status === 204) return undefined as T;
  if (res.ok && blob) return (await res.blob()) as T;
  const data = (await res.json().catch(() => null)) as T | ApiErrorBody | null;
  if (!res.ok) {
    const error = (data as ApiErrorBody | null)?.error ?? {
      code: "HTTP_ERROR",
      message: "The request failed.",
    };
    throw new ApiError(res.status, error);
  }
  return data as T;
}

export function apiBlob(path: string, method: Options["method"] = "GET"): Promise<Blob> {
  return api<Blob>(path, { method, blob: true });
}
