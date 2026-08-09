"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import {
  deleteSite,
  formatFrequency,
  getSite,
  getSiteHistory,
  getSiteStatus,
  updateSite,
  type HistoryRecord,
  type Site,
  type UpdateSiteInput,
} from "@/lib/sites";
import { buildUptimeView, formatUptimePercent, pickHistoryWindow } from "@/lib/uptime";
import { useNextCheck } from "@/lib/useNextCheck";
import { StatusBadge } from "@/components/StatusBadge";
import { SiteSettingsModal } from "@/components/SiteSettingsModal";
import { HistoryTable } from "@/components/HistoryTable";
import { UptimeBar, UptimeBarSkeleton } from "@/components/UptimeBar";
import { IncidentPanel } from "@/components/IncidentPanel";
import {
  Alert,
  BackLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Skeleton,
} from "@/components/ui";

// Matches the dashboard's poll cadence (useSites.ts) - without this, the
// status badge and stats here just freeze at whatever they were when the
// page loaded, unlike the dashboard which refreshes.
const STATUS_POLL_INTERVAL_MS = 60_000;

interface HistoryWindow {
  fromMs: number;
  toMs: number;
  spanMs: number;
}


export default function SiteDetailPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const siteId = params.id;

  const [site, setSite] = useState<Site | null>(null);
  const [siteLoading, setSiteLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [historyWindow, setHistoryWindow] = useState<HistoryWindow | null>(null);
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [detailsOpenOverride, setDetailsOpenOverride] = useState<boolean | null>(null);

  // Read inside the status-poll interval below without making that effect
  // depend on `site` (which changes every tick once the poll starts).
  const siteRef = useRef<Site | null>(null);
  useEffect(() => {
    siteRef.current = site;
  }, [site]);

  // The window (from/to) is fixed once per site load so "Load more" pages
  // forward within it instead of drifting - only the cursor changes.
  const loadHistory = useCallback(
    async (window: HistoryWindow, cursor?: string) => {
      setHistoryLoading(true);
      try {
        const page = await getSiteHistory(siteId, {
          from: new Date(window.fromMs).toISOString(),
          to: new Date(window.toMs).toISOString(),
          cursor,
        });
        setRecords((previous) => (cursor ? [...previous, ...page.records] : page.records));
        setNextCursor(page.next_cursor);
        setHistoryError(null);
      } catch (err) {
        // Without this catch, a rejected fetch here escaped as an unhandled
        // promise rejection - records simply stayed [] with no visible error.
        setHistoryError(err instanceof ApiError ? err.message : "Couldn't load check history.");
      } finally {
        setHistoryLoading(false);
      }
    },
    [siteId]
  );

  // The window is "last N hours from now", so it must slide forward on its
  // own timer - otherwise the strip's live edge silently goes gray (no
  // checks fetched yet) even while the status header above it is fresh,
  // which reads as "monitoring stopped" rather than "healthy". Runs
  // silently (no historyLoading toggle) so it doesn't flicker the "Load
  // more" button, and replaces records wholesale since the window itself
  // has moved - any extra pages a user loaded are for a window that no
  // longer applies.
  const refreshHistoryWindow = useCallback(
    async (checkFrequencyMinutes: number, lastCheckedAtMs?: number | null) => {
      const window = pickHistoryWindow(checkFrequencyMinutes, Date.now(), lastCheckedAtMs);
      setHistoryWindow(window);
      try {
        const page = await getSiteHistory(siteId, {
          from: new Date(window.fromMs).toISOString(),
          to: new Date(window.toMs).toISOString(),
        });
        setRecords(page.records);
        setNextCursor(page.next_cursor);
      } catch {
        // Best-effort - a stale strip for one more tick beats clobbering
        // the page with an error for a background refresh.
      }
    },
    [siteId]
  );

  useEffect(() => {
    if (!user) {
      return;
    }
    let cancelled = false;

    void (async () => {
      try {
        const result = await getSite(siteId);
        if (cancelled) return;
        setSite(result);
        setNotFound(false);
        setError(null);

        // The history window depends on the site's check frequency (a
        // 5-minute site needs a much narrower window than a daily one to
        // fit within the API's 100-record page cap), so it can only be
        // computed once the site itself has loaded.
        const window = pickHistoryWindow(
          result.check_frequency_minutes,
          Date.now(),
          result.status.checked_at ? Date.parse(result.status.checked_at) : null
        );
        setHistoryWindow(window);
        await loadHistory(window);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof ApiError ? err.message : "Couldn't load this site.");
        }
      } finally {
        if (!cancelled) setSiteLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // loadHistory is recreated only when siteId changes, so this effect
    // intentionally runs once per (user, siteId) pair, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, siteId]);

  useEffect(() => {
    if (!user) {
      return;
    }
    const id = setInterval(async () => {
      try {
        const latest = await getSiteStatus(siteId);
        setSite((current) =>
          current
            ? {
                ...current,
                status: {
                  status: latest.status,
                  status_code: latest.status_code,
                  latency_ms: latest.latency_ms,
                  checked_at: latest.checked_at,
                  error_type: latest.error_type,
                  error_message: latest.error_message,
                  consecutive_failures: latest.consecutive_failures,
                  last_status_change_at: latest.last_status_change_at,
                },
              }
            : current
        );

        if (siteRef.current) {
          await refreshHistoryWindow(
            siteRef.current.check_frequency_minutes,
            latest.checked_at ? Date.parse(latest.checked_at) : null
          );
        }
      } catch {
        // Best-effort background refresh - a transient poll failure shouldn't
        // clobber the page; the initial load already owns the "real" error state.
      }
    }, STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [user, siteId, refreshHistoryWindow]);

  const uptime = useMemo(() => {
    if (!site || !historyWindow) return null;
    return buildUptimeView(
      { records, fromMs: historyWindow.fromMs, toMs: historyWindow.toMs, spanMs: historyWindow.spanMs },
      { checkIntervalMinutes: site.check_frequency_minutes, monitoredSinceMs: Date.parse(site.created_at) }
    );
  }, [records, historyWindow, site]);

  // Avoid allocating a reversed copy on every status-poll re-render.
  const reversedRecords = useMemo(() => [...records].reverse(), [records]);

  const nextCheck = useNextCheck(
    site?.status.checked_at ?? null,
    site?.check_frequency_minutes ?? 5,
    site?.enabled ?? false
  );

  // The (app) layout already gates on auth and shows a skeleton while it
  // resolves; this is just a type-narrowing guard, not a second loading UI.
  if (authLoading || !user) {
    return null;
  }

  if (siteLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3">
          <Card padding="md">
            <UptimeBarSkeleton />
          </Card>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-hairline bg-hairline sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="bg-surface p-4">
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <Card padding="none">
          <EmptyState
            title="Site not found"
            description="This site doesn't exist in your account."
            action={
              <Link
                href="/dashboard"
                className="focus-ring group inline-flex items-center gap-2 rounded-xs font-mono text-xs uppercase tracking-widest text-ink-subtle transition-colors hover:text-ink"
              >
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" className="transition-transform group-hover:-translate-x-0.5">
                  <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Dashboard
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  if (error || !site) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <Alert tone="error">{error ?? "Something went wrong."}</Alert>
      </div>
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

  const hasIncident = site.status.status === "down";
  const detailsOpen = detailsOpenOverride ?? hasIncident;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <div className="space-y-1">
        <BackLink href="/dashboard">Dashboard</BackLink>

        <PageHeader
          title={site.name}
          description={
            <a
              href={site.url}
              target="_blank"
              rel="noreferrer"
              className="focus-ring rounded-xs text-ink-subtle hover:text-ink"
            >
              {site.url}
            </a>
          }
          actions={
            <div className="flex items-center gap-2">
              <StatusBadge status={site.status.status} />
              <SiteSettingsModal site={site} onUpdate={handleUpdate} onDelete={handleDelete} />
            </div>
          }
          className="mb-0"
        />
      </div>

      <div className="space-y-3">
        <Card padding="none">
        <CardHeader
          title="Uptime"
          description={uptime ? `${formatUptimePercent(uptime.percent)} · ${uptime.windowLabel}` : undefined}
          actions={
            hasIncident && (
              <button
                type="button"
                aria-expanded={detailsOpen}
                aria-controls="incident-panel"
                onClick={() => setDetailsOpenOverride(!detailsOpen)}
                className="focus-ring inline-flex items-center gap-1 rounded-xs py-2 -my-2 text-sm font-medium text-accent hover:text-accent-hover"
              >
                {detailsOpen ? "Hide details" : "Show details"}
              </button>
            )
          }
        />
        <CardBody className="space-y-4">
          {hasIncident && detailsOpen && <IncidentPanel id="incident-panel" status={site.status} />}

          {uptime ? (
            <UptimeBar
              buckets={uptime.buckets}
              axisLabels={uptime.axisLabels}
              summary={uptime.summary}
              details={uptime.outageDetails}
              muted={!site.enabled}
              className="pt-1"
            />
          ) : (
            <UptimeBarSkeleton />
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-hairline bg-hairline sm:grid-cols-4">
        <div className="bg-surface p-4">
          <p className="text-xs text-ink-subtle">Last checked</p>
          <p className="mt-1 text-sm font-medium text-ink">
            {site.status.checked_at ? new Date(site.status.checked_at).toLocaleString() : "Never checked"}
          </p>
          {nextCheck && (
            <p className="mt-0.5 text-xs tabular-nums text-ink-subtle">
              Next in {nextCheck}
            </p>
          )}
        </div>
        <div className="bg-surface p-4">
          <p className="text-xs text-ink-subtle">Response time</p>
          <p className="mt-1 text-sm font-medium tabular-nums text-ink">
            {site.status.latency_ms !== null ? `${site.status.latency_ms} ms` : "-"}
          </p>
        </div>
        <div className="bg-surface p-4">
          <p className="text-xs text-ink-subtle">Status code</p>
          <p
            className={`mt-1 text-sm font-medium tabular-nums ${
              site.status.status_code && site.status.status_code >= 400 ? "text-down" : "text-ink"
            }`}
          >
            {site.status.status_code ?? "-"}
          </p>
        </div>
        <div className="bg-surface p-4">
          <p className="text-xs text-ink-subtle">Check frequency</p>
          <p className="mt-1 text-sm font-medium text-ink">{formatFrequency(site.check_frequency_minutes)}</p>
        </div>
      </div>
      </div>

      <Card padding="none">
        <CardHeader title="Check history" />
        {historyError && (
          <div className="px-6 pt-4">
            <Alert tone="error">{historyError}</Alert>
          </div>
        )}
        <HistoryTable
          records={reversedRecords}
          nextCursor={nextCursor}
          onLoadMore={() => historyWindow && nextCursor && loadHistory(historyWindow, nextCursor)}
          loadingMore={historyLoading}
        />
      </Card>

    </div>
  );
}
