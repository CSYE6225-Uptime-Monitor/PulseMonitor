import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";
import { listSites, type Site } from "./sites";

interface UseSitesResult {
  sites: Site[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// The pinger only ticks every 5 minutes at minimum (var.ping_schedule), so a
// 60s poll is frequent enough to feel live without hammering the API.
const DEFAULT_POLL_INTERVAL_MS = 60_000;

export function useSites(pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS): UseSitesResult {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await listSites();
      setSites(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load sites.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
    const id = setInterval(refresh, pollIntervalMs);
    return () => clearInterval(id);
  }, [refresh, pollIntervalMs]);

  return { sites, loading, error, refresh };
}
