"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import {
  deleteSite,
  getSite,
  getSiteHistory,
  updateSite,
  type HistoryRecord,
  type Site,
  type UpdateSiteInput,
} from "@/lib/sites";
import { StatusBadge } from "@/components/StatusBadge";
import { SiteForm, type SiteFormValues } from "@/components/SiteForm";
import { HistoryTable } from "@/components/HistoryTable";

export default function SiteDetailPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const siteId = params.id;

  const [site, setSite] = useState<Site | null>(null);
  const [siteLoading, setSiteLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadSite = useCallback(async () => {
    try {
      const result = await getSite(siteId);
      setSite(result);
      setNotFound(false);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      } else {
        setError(err instanceof ApiError ? err.message : "Failed to load site.");
      }
    } finally {
      setSiteLoading(false);
    }
  }, [siteId]);

  const loadHistory = useCallback(
    async (cursor?: string) => {
      setHistoryLoading(true);
      try {
        const page = await getSiteHistory(siteId, cursor ? { cursor } : undefined);
        setRecords((previous) => (cursor ? [...previous, ...page.records] : page.records));
        setNextCursor(page.next_cursor);
        setHistoryError(null);
      } catch (err) {
        // Without this catch, a rejected fetch here escaped as an unhandled
        // promise rejection through the Promise.all below - e2e ran green
        // against a genuinely broken endpoint because records simply stayed [].
        setHistoryError(err instanceof ApiError ? err.message : "Failed to load history.");
      } finally {
        setHistoryLoading(false);
      }
    },
    [siteId]
  );

  useEffect(() => {
    if (!user) {
      return;
    }
    void (async () => {
      await Promise.all([loadSite(), loadHistory()]);
    })();
    // loadSite/loadHistory are recreated only when siteId changes, so this
    // effect intentionally runs once per (user, siteId) pair, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, siteId]);

  if (authLoading || !user) {
    return <p className="p-8 text-zinc-600 dark:text-zinc-400">Loading...</p>;
  }

  if (siteLoading) {
    return <p className="p-8 text-zinc-600 dark:text-zinc-400">Loading site...</p>;
  }

  if (notFound) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 p-8">
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          Site not found.
        </p>
        <a href="/dashboard" className="text-sm font-medium text-zinc-950 underline dark:text-zinc-50">
          Back to dashboard
        </a>
      </div>
    );
  }

  if (error || !site) {
    return (
      <p role="alert" className="p-8 text-sm text-red-700 dark:text-red-300">
        {error ?? "Something went wrong."}
      </p>
    );
  }

  async function handleUpdate(input: UpdateSiteInput) {
    const updated = await updateSite(siteId, input);
    setSite(updated);
  }

  async function handleDelete() {
    await deleteSite(siteId);
    router.push("/dashboard");
  }

  const formValues: SiteFormValues = {
    url: site.url,
    name: site.name,
    check_frequency_minutes: site.check_frequency_minutes,
    enabled: site.enabled,
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-8">
      <a href="/dashboard" className="block text-sm font-medium text-zinc-600 underline dark:text-zinc-400">
        Back to dashboard
      </a>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">{site.name}</h1>
        <StatusBadge status={site.status.status} />
      </div>

      <dl className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
        <div>
          <dt className="inline font-medium">URL: </dt>
          <dd className="inline">{site.url}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Last checked: </dt>
          <dd className="inline">
            {site.status.checked_at ? new Date(site.status.checked_at).toLocaleString() : "Never checked"}
          </dd>
        </div>
        {site.status.error_message && (
          <div>
            <dt className="inline font-medium">Last error: </dt>
            <dd className="inline">{site.status.error_message}</dd>
          </div>
        )}
      </dl>

      <SiteForm mode="edit" initialValues={formValues} onSubmit={handleUpdate} />

      <button
        type="button"
        onClick={handleDelete}
        className="text-sm font-medium text-red-700 underline dark:text-red-400"
      >
        Delete site
      </button>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">History</h2>
        {historyError && (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            {historyError}
          </p>
        )}
        <HistoryTable
          records={records}
          nextCursor={nextCursor}
          onLoadMore={() => nextCursor && loadHistory(nextCursor)}
          loadingMore={historyLoading}
        />
      </div>
    </div>
  );
}
