export interface User {
  email: string;
  user_id: string;
  first_name: string;
  last_name: string;
  created_at: string;
  updated_at: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let csrfToken: string | null = null;

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch("/api/v1/csrf-token", { credentials: "include" });
  const body = (await res.json()) as ApiEnvelope<{ csrfToken: string }>;

  if (!body.success || !body.data) {
    throw new ApiError(res.status, body.error ?? "Failed to fetch CSRF token.");
  }

  csrfToken = body.data.csrfToken;
  return csrfToken;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isMutating = method !== "GET";
  if (isMutating && !csrfToken) {
    await fetchCsrfToken();
  }

  const res = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(isMutating && csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // DELETE endpoints return 204 with no body - parsing it as JSON would throw.
  if (res.status === 204) {
    return undefined as T;
  }

  const envelope = (await res.json()) as ApiEnvelope<T>;

  if (!envelope.success) {
    throw new ApiError(res.status, envelope.error ?? "Request failed.");
  }

  return envelope.data as T;
}

export const api = {
  getCsrfToken: fetchCsrfToken,
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};
