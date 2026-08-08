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

export type QueryParams = Record<string, string | number | boolean | undefined>;

function withQuery(path: string, params?: QueryParams): string {
  if (!params) {
    return path;
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }

  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

let csrfToken: string | null = null;

/**
 * Drops the cached CSRF token. Logout destroys the session's csrfId server-side
 * (see backend/src/routes/auth.js `req.session = null`), which invalidates any
 * token minted against it - without this, the next mutating request after a
 * logout/login cycle would send a stale token and get a spurious 403.
 */
export function clearCsrfToken(): void {
  csrfToken = null;
}

type UnauthorizedListener = () => void;
let unauthorizedListener: UnauthorizedListener | null = null;

/**
 * Registers a callback fired whenever any request resolves with 401 - lets
 * the app react to a session expiring mid-use (see auth.tsx), not just on
 * the initial mount check. Pass null to unsubscribe.
 */
export function onUnauthorized(listener: UnauthorizedListener | null): void {
  unauthorizedListener = listener;
}

/**
 * A 502/504 from a proxy or load balancer returns an HTML error page, not
 * JSON - res.json() throws a SyntaxError in that case. Surfacing that as an
 * ApiError (not a bare Error) keeps every `err instanceof ApiError` check in
 * the app working, instead of e.g. AuthProvider's mount check treating it
 * like "not logged in" and silently signing out a valid session.
 */
async function readEnvelope<T>(res: Response): Promise<ApiEnvelope<T>> {
  try {
    return (await res.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError(res.status, `Request failed with status ${res.status}.`);
  }
}

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch("/api/v1/csrf-token", { credentials: "include" });
  const body = await readEnvelope<{ csrfToken: string }>(res);

  if (!body.success || !body.data) {
    throw new ApiError(res.status, body.error ?? "Failed to fetch CSRF token.");
  }

  csrfToken = body.data.csrfToken;
  return csrfToken;
}

async function performRequest<T>(method: string, path: string, isMutating: boolean, body?: unknown) {
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
    return { res, data: undefined as T };
  }

  const envelope = await readEnvelope<T>(res);
  return { res, envelope };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isMutating = method !== "GET";
  if (isMutating && !csrfToken) {
    await fetchCsrfToken();
  }

  let { res, envelope, data } = await performRequest<T>(method, path, isMutating, body);

  // A 403 on a mutating request means the cached token is bound to a csrfId the
  // server no longer recognizes (e.g. a logout happened since it was minted).
  // Refresh the token and retry exactly once - retrying more than that would
  // mask a genuine, persistent auth failure as an infinite loop.
  if (isMutating && res.status === 403) {
    clearCsrfToken();
    await fetchCsrfToken();
    ({ res, envelope, data } = await performRequest<T>(method, path, isMutating, body));
  }

  if (res.status === 204) {
    return data as T;
  }

  if (!envelope || !envelope.success) {
    if (res.status === 401) {
      unauthorizedListener?.();
    }
    throw new ApiError(res.status, envelope?.error ?? "Request failed.");
  }

  return envelope.data as T;
}

export const api = {
  getCsrfToken: fetchCsrfToken,
  get: <T>(path: string, params?: QueryParams) => request<T>("GET", withQuery(path, params)),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};
