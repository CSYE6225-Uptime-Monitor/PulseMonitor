import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { formatNextCheckLabel, useNextCheck, GRACE_PERIOD_MS } from "./useNextCheck";

// ---------------------------------------------------------------------------
// Pure formatter
// ---------------------------------------------------------------------------

describe("formatNextCheckLabel", () => {
  it("formats multi-minute countdown", () => {
    expect(formatNextCheckLabel(3 * 60_000 + 42_000)).toBe("3m 42s");
  });

  it("formats sub-minute countdown as seconds only", () => {
    expect(formatNextCheckLabel(30_000)).toBe("30s");
  });

  it("rounds sub-second remainder up to 1s", () => {
    expect(formatNextCheckLabel(500)).toBe("1s");
  });

  it("shows 0-seconds edge as 'any moment now'", () => {
    expect(formatNextCheckLabel(0)).toBe("any moment now");
  });

  it("shows 'any moment now' within grace period", () => {
    expect(formatNextCheckLabel(-30_000)).toBe("any moment now");
  });

  it("shows 'any moment now' at the last ms of grace period", () => {
    expect(formatNextCheckLabel(-(GRACE_PERIOD_MS - 1))).toBe("any moment now");
  });

  it("returns null exactly at grace period boundary", () => {
    expect(formatNextCheckLabel(-GRACE_PERIOD_MS)).toBeNull();
  });

  it("returns null well past deadline (frequency-change scenario)", () => {
    // e.g. frequency dropped from 24h → 5min; last check was 1 hour ago
    expect(formatNextCheckLabel(-55 * 60_000)).toBeNull();
  });

  it("returns null for extreme past values", () => {
    expect(formatNextCheckLabel(-24 * 60 * 60_000)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

describe("useNextCheck", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // --- static / opt-out states ---

  it("returns null when site is disabled", () => {
    const checkedAt = new Date(Date.now() - 30_000).toISOString();
    const { result } = renderHook(() => useNextCheck(checkedAt, 5, false));
    expect(result.current).toBeNull();
  });

  it("returns null when never checked", () => {
    const { result } = renderHook(() => useNextCheck(null, 5, true));
    expect(result.current).toBeNull();
  });

  // --- normal countdown ---

  it("shows countdown when next check is upcoming", () => {
    const checkedAt = new Date(Date.now() - 60_000).toISOString(); // 1 min ago → 4 min left
    const { result } = renderHook(() => useNextCheck(checkedAt, 5, true));
    expect(result.current).toMatch(/^\dm \d+s$/);
  });

  it("decrements each second", () => {
    const checkedAt = new Date(Date.now() - 60_000).toISOString();
    const { result } = renderHook(() => useNextCheck(checkedAt, 5, true));
    const before = result.current;
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(result.current).not.toBe(before);
  });

  // --- boundary transitions ---

  it("transitions to 'any moment now' as countdown reaches zero", () => {
    // Next check in ~2s
    const checkedAt = new Date(Date.now() - (5 * 60_000 - 2_000)).toISOString();
    const { result } = renderHook(() => useNextCheck(checkedAt, 5, true));
    expect(result.current).toMatch(/^\ds$/);
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(result.current).toBe("any moment now");
  });

  it("transitions to null after grace period expires", () => {
    // 10s before grace period ends
    const checkedAt = new Date(Date.now() - (5 * 60_000 + GRACE_PERIOD_MS - 10_000)).toISOString();
    const { result } = renderHook(() => useNextCheck(checkedAt, 5, true));
    expect(result.current).toBe("any moment now");
    act(() => { vi.advanceTimersByTime(11_000); });
    expect(result.current).toBeNull();
  });

  it("shows 'any moment now' when deadline just passed", () => {
    const checkedAt = new Date(Date.now() - (5 * 60_000 + 10_000)).toISOString(); // 10s overdue
    const { result } = renderHook(() => useNextCheck(checkedAt, 5, true));
    expect(result.current).toBe("any moment now");
  });

  it("returns null when already past grace period on mount", () => {
    // frequency-change scenario: last check was 1 hour ago, new freq is 5 min
    const checkedAt = new Date(Date.now() - 60 * 60_000).toISOString();
    const { result } = renderHook(() => useNextCheck(checkedAt, 5, true));
    expect(result.current).toBeNull();
  });

  // --- reactivity ---

  it("resets countdown when checkedAt updates (new check fires)", () => {
    // Start past grace period — nothing showing
    const stale = new Date(Date.now() - 60 * 60_000).toISOString();
    const { result, rerender } = renderHook(
      ({ t }: { t: string | null }) => useNextCheck(t, 5, true),
      { initialProps: { t: stale } }
    );
    expect(result.current).toBeNull();

    // New check fires — checkedAt is now 1 minute ago
    const fresh = new Date(Date.now() - 60_000).toISOString();
    act(() => { rerender({ t: fresh }); });
    expect(result.current).toMatch(/^\dm \d+s$/);
  });

  it("recomputes immediately when frequency increases (check is still upcoming)", () => {
    const checkedAt = new Date(Date.now() - 10 * 60_000).toISOString(); // 10 min ago
    const { result, rerender } = renderHook(
      ({ freq }: { freq: number }) => useNextCheck(checkedAt, freq, true),
      { initialProps: { freq: 60 } } // 1h interval → ~50 min left
    );
    expect(result.current).toMatch(/^\d+m \d+s$/);

    act(() => { rerender({ freq: 5 }); }); // 5 min interval → 10 min past deadline
    // deadline was 5 min ago, grace is 2 min → null
    expect(result.current).toBeNull();
  });

  it("recomputes immediately when frequency decreases to still-valid window", () => {
    const checkedAt = new Date(Date.now() - 2 * 60_000).toISOString(); // 2 min ago
    const { result, rerender } = renderHook(
      ({ freq }: { freq: number }) => useNextCheck(checkedAt, freq, true),
      { initialProps: { freq: 5 } } // next in 3 min
    );
    expect(result.current).toMatch(/^\dm \d+s$/);

    act(() => { rerender({ freq: 60 }); }); // 1h interval → next in 58 min
    expect(result.current).toMatch(/^\d+m \d+s$/);
  });

  it("hides countdown when site becomes disabled", () => {
    const checkedAt = new Date(Date.now() - 60_000).toISOString();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useNextCheck(checkedAt, 5, enabled),
      { initialProps: { enabled: true } }
    );
    expect(result.current).not.toBeNull();

    act(() => { rerender({ enabled: false }); });
    expect(result.current).toBeNull();
  });

  it("restores countdown when site is re-enabled", () => {
    const checkedAt = new Date(Date.now() - 60_000).toISOString();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useNextCheck(checkedAt, 5, enabled),
      { initialProps: { enabled: false } }
    );
    expect(result.current).toBeNull();

    act(() => { rerender({ enabled: true }); });
    expect(result.current).toMatch(/^\dm \d+s$/);
  });

  it("clears interval on unmount (no state-after-unmount warnings)", () => {
    const checkedAt = new Date(Date.now() - 60_000).toISOString();
    const { unmount } = renderHook(() => useNextCheck(checkedAt, 5, true));
    unmount();
    // Advancing time after unmount should not throw
    expect(() => { vi.advanceTimersByTime(5_000); }).not.toThrow();
  });
});
