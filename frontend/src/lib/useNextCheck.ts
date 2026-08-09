"use client";

import { useEffect, useState } from "react";

/** How long past the scheduled check time we still show "any moment now". */
export const GRACE_PERIOD_MS = 2 * 60_000;

/**
 * Pure formatter — exported for unit testing.
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
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !checkedAt) {
      setLabel(null);
      return;
    }

    const nextMs = Date.parse(checkedAt) + frequencyMinutes * 60_000;

    function tick() {
      setLabel(formatNextCheckLabel(nextMs - Date.now()));
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [checkedAt, frequencyMinutes, enabled]);

  return label;
}
