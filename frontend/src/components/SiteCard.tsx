"use client";

import { useState } from "react";
import Link from "next/link";
import type { Site } from "@/lib/sites";
import type { SiteUptimeEntry } from "@/lib/useSiteHistories";
import { buildUptimeView, formatUptimePercent } from "@/lib/uptime";
import { StatusBadge } from "./StatusBadge";
import { UptimeBar, UptimeBarSkeleton } from "./UptimeBar";
import { IncidentPanel } from "./IncidentPanel";
import { Card, CardBody } from "@/components/ui";

function displayHost(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export interface SiteCardProps {
  site: Site;
  history: SiteUptimeEntry | undefined;
}

export function SiteCard({ site, history }: SiteCardProps) {
  const [detailsOpenOverride, setDetailsOpenOverride] = useState<boolean | null>(null);
  const hasIncident = site.status.status === "down";
  const detailsOpen = detailsOpenOverride ?? hasIncident;
  const panelId = `incident-${site.site_id}`;

  const uptime = history?.window
    ? buildUptimeView(history.window, {
        checkIntervalMinutes: site.check_frequency_minutes,
        monitoredSinceMs: Date.parse(site.created_at),
      })
    : null;

  return (
    <Card interactive>
      <CardBody className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/sites/${site.site_id}`}
              className="focus-ring block truncate rounded-xs text-base font-semibold text-ink hover:text-accent"
            >
              {site.name}
            </Link>
            <p className="mt-0.5 truncate text-sm text-ink-subtle" title={site.url}>
              {displayHost(site.url)}
            </p>
          </div>
          <StatusBadge status={site.status.status} />
        </div>

        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-ink-muted">Uptime</span>
          <div className="flex items-center gap-3">
            <span className="text-ink-subtle">
              {uptime ? formatUptimePercent(uptime.percent) : "No data yet"}
              {uptime && uptime.percent !== null && (hasIncident ? " – Current issues" : " – No current issues")}
            </span>
            {hasIncident && (
              <button
                type="button"
                aria-expanded={detailsOpen}
                aria-controls={panelId}
                onClick={() => setDetailsOpenOverride(!detailsOpen)}
                className="focus-ring rounded-xs text-sm font-medium text-accent hover:text-accent-hover"
              >
                {detailsOpen ? "Hide details" : "Show details"}
              </button>
            )}
          </div>
        </div>

        {hasIncident && detailsOpen && <IncidentPanel id={panelId} status={site.status} />}

        {history?.error ? (
          <p className="text-xs text-ink-faint">Uptime history unavailable</p>
        ) : uptime ? (
          <UptimeBar
            buckets={uptime.buckets}
            axisLabels={uptime.axisLabels}
            summary={uptime.summary}
            details={uptime.outageDetails}
            muted={!site.enabled}
          />
        ) : (
          <UptimeBarSkeleton />
        )}
      </CardBody>

      <div className="grid grid-cols-2 gap-4 border-t border-hairline bg-surface-subtle px-6 py-3 text-xs">
        <div className="min-w-0">
          <p className="text-ink-subtle">Last checked</p>
          <p className="mt-0.5 truncate font-medium text-ink">
            {site.status.checked_at ? new Date(site.status.checked_at).toLocaleString() : "Never checked"}
          </p>
        </div>
        <div>
          <p className="text-ink-subtle">Latency</p>
          <p className="mt-0.5 font-medium tabular-nums text-ink">
            {site.status.latency_ms !== null ? `${site.status.latency_ms} ms` : "—"}
          </p>
        </div>
      </div>
    </Card>
  );
}
