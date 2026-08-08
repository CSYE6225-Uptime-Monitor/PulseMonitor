import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api, ApiError, clearCsrfToken, onUnauthorized } from "./api";

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    json: async () => body,
  } as Response;
}

describe("api client", () => {
  beforeEach(() => {
    clearCsrfToken();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    onUnauthorized(null);
  });

  it("fetches and caches a csrf token before the first mutating request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { csrfToken: "token-a" }, error: null }))
      .mockResolvedValueOnce(jsonResponse(201, { success: true, data: { ok: true }, error: null }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.post("/v1/sites", { name: "x" });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/csrf-token");
    expect(fetchMock.mock.calls[1][1].headers["x-csrf-token"]).toBe("token-a");
  });

  it("does not re-fetch a csrf token for subsequent mutating requests once cached", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { csrfToken: "token-a" }, error: null }))
      .mockResolvedValueOnce(jsonResponse(201, { success: true, data: { ok: true }, error: null }))
      .mockResolvedValueOnce(jsonResponse(201, { success: true, data: { ok: true }, error: null }));
    vi.stubGlobal("fetch", fetchMock);

    await api.post("/v1/sites", { name: "x" });
    await api.post("/v1/sites", { name: "y" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not send a csrf header on GET requests and never fetches a token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { site_id: "1" }, error: null }));
    vi.stubGlobal("fetch", fetchMock);

    await api.get("/v1/sites/1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers["x-csrf-token"]).toBeUndefined();
  });

  it("returns undefined for 204 responses without parsing a body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { csrfToken: "token-a" }, error: null }))
      .mockResolvedValueOnce({ status: 204, json: () => { throw new Error("must not parse body"); } } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.del("/v1/sites/1");

    expect(result).toBeUndefined();
  });

  it("throws an ApiError, not a raw SyntaxError, when the response body isn't JSON", async () => {
    // Models a 502/504 from a proxy returning an HTML error page.
    const fetchMock = vi.fn().mockResolvedValue({
      status: 502,
      json: async () => {
        throw new SyntaxError("Unexpected token '<'");
      },
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    let caught: unknown;
    try {
      await api.get("/v1/sites");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(502);
  });

  it("throws ApiError with the envelope's error message when success is false", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(404, { success: false, data: null, error: "Site not found." }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.get("/v1/sites/missing")).rejects.toMatchObject({
      status: 404,
      message: "Site not found.",
    });
  });

  it("clearCsrfToken forces the next mutating request to re-fetch a token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { csrfToken: "token-a" }, error: null }))
      .mockResolvedValueOnce(jsonResponse(201, { success: true, data: { ok: true }, error: null }));
    vi.stubGlobal("fetch", fetchMock);
    await api.post("/v1/sites", { name: "x" });

    clearCsrfToken();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { csrfToken: "token-b" }, error: null }))
      .mockResolvedValueOnce(jsonResponse(201, { success: true, data: { ok: true }, error: null }));
    await api.post("/v1/sites", { name: "y" });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][1].headers["x-csrf-token"]).toBe("token-b");
  });

  it("retries a mutating request once, after refreshing the csrf token, when the server returns 403", async () => {
    // Models the real failure mode: logout destroys req.session.csrfId server-side,
    // but the module-level cache in api.ts still holds a token bound to the old id.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { csrfToken: "stale-token" }, error: null }))
      .mockResolvedValueOnce(jsonResponse(403, { success: false, data: null, error: "Invalid or missing CSRF token." }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { csrfToken: "fresh-token" }, error: null }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { ok: true }, error: null }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.post("/v1/login", { email: "a@b.com", password: "x" });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][1].headers["x-csrf-token"]).toBe("fresh-token");
  });

  it("does not retry more than once and surfaces the error if the retry also 403s", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { csrfToken: "stale-token" }, error: null }))
      .mockResolvedValueOnce(jsonResponse(403, { success: false, data: null, error: "Invalid or missing CSRF token." }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { csrfToken: "still-stale" }, error: null }))
      .mockResolvedValueOnce(jsonResponse(403, { success: false, data: null, error: "Invalid or missing CSRF token." }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.post("/v1/login", {})).rejects.toThrow(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not attempt a csrf retry on 403 for GET requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(403, { success: false, data: null, error: "Authentication required." }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.get("/v1/user/self")).rejects.toThrow(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe("unauthorized handling", () => {
    it("invokes the registered listener when a request resolves with 401", async () => {
      const listener = vi.fn();
      onUnauthorized(listener);

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(401, { success: false, data: null, error: "Authentication required." }));
      vi.stubGlobal("fetch", fetchMock);

      await expect(api.get("/v1/user/self")).rejects.toMatchObject({ status: 401 });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("does not invoke the listener for non-401 errors", async () => {
      const listener = vi.fn();
      onUnauthorized(listener);

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(404, { success: false, data: null, error: "Site not found." }));
      vi.stubGlobal("fetch", fetchMock);

      await expect(api.get("/v1/sites/missing")).rejects.toMatchObject({ status: 404 });
      expect(listener).not.toHaveBeenCalled();
    });

    it("stops invoking the listener once unsubscribed with null", async () => {
      const listener = vi.fn();
      onUnauthorized(listener);
      onUnauthorized(null);

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(401, { success: false, data: null, error: "Authentication required." }));
      vi.stubGlobal("fetch", fetchMock);

      await expect(api.get("/v1/user/self")).rejects.toMatchObject({ status: 401 });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("query params", () => {
    it("appends no query string when params are omitted", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { sites: [] }, error: null }));
      vi.stubGlobal("fetch", fetchMock);

      await api.get("/v1/sites");

      expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/sites");
    });

    it("serializes provided params onto the path as a query string", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { records: [] }, error: null }));
      vi.stubGlobal("fetch", fetchMock);

      await api.get("/v1/sites/1/history", { limit: 10, cursor: "abc" });

      expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/sites/1/history?limit=10&cursor=abc");
    });

    it("omits keys whose value is undefined", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { records: [] }, error: null }));
      vi.stubGlobal("fetch", fetchMock);

      await api.get("/v1/sites/1/history", { limit: 10, cursor: undefined });

      expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/sites/1/history?limit=10");
    });

    it("URL-encodes special characters in param values", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { records: [] }, error: null }));
      vi.stubGlobal("fetch", fetchMock);

      await api.get("/v1/sites/1/history", { cursor: "a b&c" });

      expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/sites/1/history?cursor=a+b%26c");
    });
  });
});
