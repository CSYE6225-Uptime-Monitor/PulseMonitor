import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("./sites", () => ({
  listSites: vi.fn(),
}));

import { listSites } from "./sites";
import { ApiError } from "./api";
import { useSites } from "./useSites";
import type { Site } from "./sites";

const exampleSite: Site = {
  site_id: "11111111-1111-1111-1111-111111111111",
  url: "https://example.com",
  name: "Example",
  check_frequency_minutes: 5,
  enabled: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  status: {
    status: "unknown",
    status_code: null,
    latency_ms: null,
    checked_at: null,
    error_type: null,
    error_message: null,
    consecutive_failures: 0,
    last_status_change_at: null,
  },
};

describe("useSites", () => {
  beforeEach(() => {
    vi.mocked(listSites).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in a loading state and populates sites once the initial fetch resolves", async () => {
    vi.mocked(listSites).mockResolvedValue([exampleSite]);

    const { result } = renderHook(() => useSites());

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sites).toEqual([exampleSite]);
    expect(result.current.error).toBeNull();
  });

  it("surfaces the ApiError message when the fetch fails", async () => {
    vi.mocked(listSites).mockRejectedValue(new ApiError(401, "Authentication required."));

    const { result } = renderHook(() => useSites());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Authentication required.");
    expect(result.current.sites).toEqual([]);
  });

  it("refetches on demand via refresh()", async () => {
    vi.mocked(listSites).mockResolvedValue([]);
    const { result } = renderHook(() => useSites());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listSites).toHaveBeenCalledTimes(1);

    vi.mocked(listSites).mockResolvedValue([exampleSite]);
    await act(async () => {
      await result.current.refresh();
    });

    expect(listSites).toHaveBeenCalledTimes(2);
    expect(result.current.sites).toEqual([exampleSite]);
  });

  it("polls listSites again after the configured interval elapses", async () => {
    vi.useFakeTimers();
    vi.mocked(listSites).mockResolvedValue([]);

    renderHook(() => useSites(60_000));
    await vi.waitFor(() => expect(listSites).toHaveBeenCalledTimes(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(listSites).toHaveBeenCalledTimes(2);
  });

  it("stops polling once the component unmounts", async () => {
    vi.useFakeTimers();
    vi.mocked(listSites).mockResolvedValue([]);

    const { unmount } = renderHook(() => useSites(60_000));
    await vi.waitFor(() => expect(listSites).toHaveBeenCalledTimes(1));

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(listSites).toHaveBeenCalledTimes(1);
  });
});
