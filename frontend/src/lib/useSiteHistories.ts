import { useEffect, useRef, useState } from "react";
import { fetchUptimeWindow, type UptimeWindow } from "./uptime";
import type { Site } from "./sites";

export interface SiteUptimeEntry {
  window: UptimeWindow | null;
  loading: boolean;
  error: boolean;
}

// listSites() already returns each site's status.checked_at for free, and
// history cannot have changed unless that value changed - so it doubles as
// the cache key. A 20-site dashboard polling every 60s would otherwise open
// 20 history requests a minute for data with a 5-minute floor.
const CONCURRENCY = 4;

interface CacheEntry {
  checkedAt: string | null;
  window: UptimeWindow;
}

async function runWithConcurrency<T>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  async function next(): Promise<void> {
    const i = index++;
    if (i >= items.length) return;
    await worker(items[i]);
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
}

/** Per-site uptime history for dashboard cards, fetched lazily and cached. */
export function useSiteHistories(sites: readonly Site[]): Record<string, SiteUptimeEntry> {
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  // Tracks the checked_at a fetch is currently in flight for. Without this,
  // an in-flight fetch's own setEntries(loading: true) triggers a re-render;
  // `sites` upstream (useSites) hands back a brand-new array on every poll,
  // so the effect below re-runs on that new reference before the fetch
  // resolves and cacheRef gets populated - re-triggering the same fetch
  // forever. Marking "in flight" synchronously, before the await, is what
  // breaks that loop.
  const inFlightRef = useRef<Map<string, string | null>>(new Map());
  const mountedRef = useRef(true);
  const [entries, setEntries] = useState<Record<string, SiteUptimeEntry>>({});

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const stale = sites.filter((site) => {
      if (!site.enabled) return false;
      const cached = cacheRef.current.get(site.site_id);
      if (cached && cached.checkedAt === site.status.checked_at) return false;
      const inFlightCheckedAt = inFlightRef.current.get(site.site_id);
      return inFlightCheckedAt === undefined || inFlightCheckedAt !== site.status.checked_at;
    });

    if (stale.length === 0) {
      return;
    }

    for (const site of stale) {
      inFlightRef.current.set(site.site_id, site.status.checked_at);
    }

    if (mountedRef.current) {
      setEntries((prev) => {
        const next = { ...prev };
        for (const site of stale) {
          next[site.site_id] = { window: prev[site.site_id]?.window ?? null, loading: true, error: false };
        }
        return next;
      });
    }

    void runWithConcurrency(stale, CONCURRENCY, async (site) => {
      try {
        const window = await fetchUptimeWindow(site);
        cacheRef.current.set(site.site_id, { checkedAt: site.status.checked_at, window });
        inFlightRef.current.delete(site.site_id);
        if (mountedRef.current) {
          setEntries((prev) => ({ ...prev, [site.site_id]: { window, loading: false, error: false } }));
        }
      } catch {
        // A single site's history failing must not blank the rest of the
        // dashboard - isolate the failure to this card only.
        inFlightRef.current.delete(site.site_id);
        if (mountedRef.current) {
          setEntries((prev) => ({
            ...prev,
            [site.site_id]: { window: prev[site.site_id]?.window ?? null, loading: false, error: true },
          }));
        }
      }
    });
  }, [sites]);

  return entries;
}
