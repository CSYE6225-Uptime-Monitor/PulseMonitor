import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("./uptime", async () => {
  const actual = await vi.importActual<typeof import("./uptime")>("./uptime");
  return { ...actual, fetchUptimeWindow: vi.fn() };
});

import { fetchUptimeWindow, type UptimeWindow } from "./uptime";
import { useSiteHistories } from "./useSiteHistories";
import type { Site } from "./sites";

function makeSite(overrides: Partial<Site> & { site_id: string }): Site {
  return {
    url: "https://example.com",
    name: "Example",
    check_frequency_minutes: 5,
    enabled: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    status: {
      status: "up",
      status_code: 200,
      latency_ms: 100,
      checked_at: "2026-01-01T00:05:00.000Z",
      error_type: null,
      error_message: null,
      consecutive_failures: 0,
      last_status_change_at: null,
    },
    ...overrides,
  };
}

function fakeWindow(): UptimeWindow {
  return { records: [], fromMs: 0, toMs: 1, spanMs: 1 };
}

describe("useSiteHistories", () => {
  beforeEach(() => {
    vi.mocked(fetchUptimeWindow).mockReset();
  });

  it("fetches history once per site on first render", async () => {
    vi.mocked(fetchUptimeWindow).mockResolvedValue(fakeWindow());
    const sites = [makeSite({ site_id: "a" }), makeSite({ site_id: "b" })];

    const { result } = renderHook(() => useSiteHistories(sites));

    await waitFor(() => expect(result.current.a?.loading).toBe(false));
    await waitFor(() => expect(result.current.b?.loading).toBe(false));

    expect(fetchUptimeWindow).toHaveBeenCalledTimes(2);
    expect(result.current.a?.window).not.toBeNull();
  });

  it("does not refetch a site whose status.checked_at is unchanged", async () => {
    vi.mocked(fetchUptimeWindow).mockResolvedValue(fakeWindow());
    const site = makeSite({ site_id: "a" });

    const { result, rerender } = renderHook(({ sites }) => useSiteHistories(sites), {
      initialProps: { sites: [site] },
    });
    await waitFor(() => expect(result.current.a?.loading).toBe(false));
    expect(fetchUptimeWindow).toHaveBeenCalledTimes(1);

    // New array reference, same checked_at - must not trigger a refetch.
    rerender({ sites: [{ ...site }] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchUptimeWindow).toHaveBeenCalledTimes(1);
  });

  it("refetches a site once its status.checked_at changes", async () => {
    vi.mocked(fetchUptimeWindow).mockResolvedValue(fakeWindow());
    const site = makeSite({ site_id: "a" });

    const { result, rerender } = renderHook(({ sites }) => useSiteHistories(sites), {
      initialProps: { sites: [site] },
    });
    await waitFor(() => expect(result.current.a?.loading).toBe(false));
    expect(fetchUptimeWindow).toHaveBeenCalledTimes(1);

    const updated = { ...site, status: { ...site.status, checked_at: "2026-01-01T00:10:00.000Z" } };
    rerender({ sites: [updated] });

    await waitFor(() => expect(fetchUptimeWindow).toHaveBeenCalledTimes(2));
  });

  it("skips disabled sites entirely - no fetch is made", async () => {
    vi.mocked(fetchUptimeWindow).mockResolvedValue(fakeWindow());
    const site = makeSite({ site_id: "a", enabled: false });

    renderHook(() => useSiteHistories([site]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchUptimeWindow).not.toHaveBeenCalled();
  });

  it("isolates a per-site fetch failure so other sites still populate", async () => {
    vi.mocked(fetchUptimeWindow).mockImplementation(async (site) => {
      if (site.site_id === "bad") throw new Error("boom");
      return fakeWindow();
    });
    const sites = [makeSite({ site_id: "bad" }), makeSite({ site_id: "good" })];

    const { result } = renderHook(() => useSiteHistories(sites));

    await waitFor(() => expect(result.current.bad?.loading).toBe(false));
    await waitFor(() => expect(result.current.good?.loading).toBe(false));

    expect(result.current.bad?.error).toBe(true);
    expect(result.current.bad?.window).toBeNull();
    expect(result.current.good?.error).toBe(false);
    expect(result.current.good?.window).not.toBeNull();
  });

  it("respects the concurrency cap when many sites need fetching at once", async () => {
    let active = 0;
    let maxActive = 0;
    vi.mocked(fetchUptimeWindow).mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return fakeWindow();
    });
    const sites = Array.from({ length: 8 }, (_, i) => makeSite({ site_id: `s${i}` }));

    const { result } = renderHook(() => useSiteHistories(sites));

    await waitFor(() => expect(result.current.s7?.loading).toBe(false));

    expect(maxActive).toBeLessThanOrEqual(4);
    expect(fetchUptimeWindow).toHaveBeenCalledTimes(8);
  });

  it("does not throw or update state after unmount", async () => {
    let resolveFetch!: (value: UptimeWindow) => void;
    vi.mocked(fetchUptimeWindow).mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; })
    );
    const site = makeSite({ site_id: "a" });

    const { unmount } = renderHook(() => useSiteHistories([site]));
    unmount();

    expect(() => resolveFetch(fakeWindow())).not.toThrow();
    await Promise.resolve();
  });
});
