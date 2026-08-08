import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("./account", () => ({
  getActivity: vi.fn(),
}));

import { getActivity } from "./account";
import { ApiError } from "./api";
import { useActivity } from "./useActivity";
import type { ActivityEvent } from "./account";

function eventAt(id: string): ActivityEvent {
  return {
    event_id: id,
    event_type: "site.created",
    occurred_at: "2026-01-01T00:00:00.000Z",
    resource_type: "site",
    resource_id: "s1",
    outcome: "success",
  };
}

describe("useActivity", () => {
  beforeEach(() => {
    vi.mocked(getActivity).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts loading, then populates events and next_cursor from the first page", async () => {
    vi.mocked(getActivity).mockResolvedValue({ events: [eventAt("e1")], next_cursor: "c1" });

    const { result } = renderHook(() => useActivity());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.events).toEqual([eventAt("e1")]);
    expect(result.current.nextCursor).toBe("c1");
    expect(result.current.error).toBeNull();
    expect(getActivity).toHaveBeenCalledWith(undefined);
  });

  it("surfaces the ApiError message when the initial load fails", async () => {
    vi.mocked(getActivity).mockRejectedValue(new ApiError(401, "Authentication required."));

    const { result } = renderHook(() => useActivity());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Authentication required.");
    expect(result.current.events).toEqual([]);
  });

  it("loadMore appends the next page and replaces nextCursor, passing the current cursor", async () => {
    vi.mocked(getActivity).mockResolvedValueOnce({ events: [eventAt("e1")], next_cursor: "c1" });
    const { result } = renderHook(() => useActivity());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(getActivity).mockResolvedValueOnce({ events: [eventAt("e2")], next_cursor: null });
    await act(async () => {
      await result.current.loadMore();
    });

    expect(getActivity).toHaveBeenLastCalledWith({ cursor: "c1" });
    expect(result.current.events).toEqual([eventAt("e1"), eventAt("e2")]);
    expect(result.current.nextCursor).toBeNull();
  });

  it("loadMore is a no-op when nextCursor is null", async () => {
    vi.mocked(getActivity).mockResolvedValueOnce({ events: [eventAt("e1")], next_cursor: null });
    const { result } = renderHook(() => useActivity());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(getActivity).toHaveBeenCalledTimes(1);
  });

  it("sets loadingMore true during the second fetch and false after", async () => {
    vi.mocked(getActivity).mockResolvedValueOnce({ events: [eventAt("e1")], next_cursor: "c1" });
    const { result } = renderHook(() => useActivity());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let resolveSecond: (value: { events: ActivityEvent[]; next_cursor: string | null }) => void;
    vi.mocked(getActivity).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSecond = resolve;
      })
    );

    let loadMorePromise!: Promise<void>;
    act(() => {
      loadMorePromise = result.current.loadMore();
    });

    await waitFor(() => expect(result.current.loadingMore).toBe(true));

    await act(async () => {
      resolveSecond({ events: [eventAt("e2")], next_cursor: null });
      await loadMorePromise;
    });

    expect(result.current.loadingMore).toBe(false);
  });

  it("a failed loadMore sets error but preserves already-loaded events", async () => {
    vi.mocked(getActivity).mockResolvedValueOnce({ events: [eventAt("e1")], next_cursor: "c1" });
    const { result } = renderHook(() => useActivity());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(getActivity).mockRejectedValueOnce(new ApiError(500, "Internal server error."));
    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.error).toBe("Internal server error.");
    expect(result.current.events).toEqual([eventAt("e1")]);
    expect(result.current.nextCursor).toBe("c1");
  });

  it("never polls - advancing time does not refetch", async () => {
    vi.useFakeTimers();
    vi.mocked(getActivity).mockResolvedValue({ events: [], next_cursor: null });

    renderHook(() => useActivity());
    await vi.waitFor(() => expect(getActivity).toHaveBeenCalledTimes(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(getActivity).toHaveBeenCalledTimes(1);
  });

  it("refresh() reloads the first page, replacing events and nextCursor", async () => {
    vi.mocked(getActivity).mockResolvedValueOnce({ events: [eventAt("e1")], next_cursor: "c1" });
    const { result } = renderHook(() => useActivity());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(getActivity).mockResolvedValueOnce({ events: [eventAt("e2")], next_cursor: null });
    await act(async () => {
      await result.current.refresh();
    });

    expect(getActivity).toHaveBeenLastCalledWith(undefined);
    expect(result.current.events).toEqual([eventAt("e2")]);
    expect(result.current.nextCursor).toBeNull();
  });
});
