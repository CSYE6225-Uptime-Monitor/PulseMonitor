"use client";

import { useCallback, useSyncExternalStore } from "react";

/** How long past the scheduled check time we still show "any moment now". */
export const GRACE_PERIOD_MS = 2 * 60_000;

/**
 * Pure formatter - exported for unit testing.
 * Returns a countdown string, "any moment now" within the grace window,
 * or null once the check is overdue beyond the grace period.
 */
export function formatNextCheckLabel(diffMs: number): string | null {
  if (diffMs > 0) {
    const totalSecs = Math.ceil(diffMs / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }
  if (diffMs > -GRACE_PERIOD_MS) {
    return "any moment now";
  }
  return null;
}

/**
 * Returns a live countdown string to the next scheduled check, updating every
 * second. Returns null when:
 * - the site is disabled
 * - the site has never been checked
 * - the check is overdue beyond the 2-minute grace period (e.g. after a
 *   frequency decrease that makes the last checkedAt obsolete)
 */
export function useNextCheck(
  checkedAt: string | null,
  frequencyMinutes: number,
  enabled: boolean
): string | null {
  // The clock is an external, mutable source, so we read it through
  // useSyncExternalStore: subscribe drives a 1s re-render, and getSnapshot
  // reads Date.now() (an impure read that only belongs outside render).
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!enabled || !checkedAt) {
        return () => {};
      }
      const id = setInterval(onChange, 1000);
      return () => clearInterval(id);
    },
    // frequencyMinutes only affects the computed value (getSnapshot), not the
    // 1s tick cadence, so it deliberately isn't a subscribe dependency.
    [checkedAt, enabled]
  );

  const getSnapshot = useCallback(() => {
    if (!enabled || !checkedAt) {
      return null;
    }
    const nextMs = Date.parse(checkedAt) + frequencyMinutes * 60_000;
    return formatNextCheckLabel(nextMs - Date.now());
  }, [checkedAt, frequencyMinutes, enabled]);

  // On the server there is no live clock; render nothing until hydration.
  const getServerSnapshot = () => null;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
