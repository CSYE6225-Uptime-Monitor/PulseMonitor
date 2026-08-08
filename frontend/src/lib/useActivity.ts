import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";
import { getActivity, type ActivityEvent } from "./account";

interface UseActivityResult {
  events: ActivityEvent[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

// No polling, unlike useSites: an activity feed is append-only history, not
// a value that changes out from under the page the way live site status does.
export function useActivity(): UseActivityResult {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getActivity(undefined);
      setEvents(page.events);
      setNextCursor(page.next_cursor);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load account activity.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (nextCursor === null) {
      return;
    }

    setLoadingMore(true);
    try {
      const page = await getActivity({ cursor: nextCursor });
      setEvents((previous) => [...previous, ...page.events]);
      setNextCursor(page.next_cursor);
      setError(null);
    } catch (err) {
      // Deliberately does not touch `events` - a failed "load more" should
      // not blank out what already loaded successfully.
      setError(err instanceof ApiError ? err.message : "Failed to load more activity.");
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor]);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
    // refresh is stable (empty dep array), so this intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { events, nextCursor, loading, loadingMore, error, loadMore, refresh };
}
