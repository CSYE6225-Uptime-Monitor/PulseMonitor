"use client";

import { useState, memo } from "react";
import Link from "next/link";
import type { Site } from "@/lib/sites";
import type { SiteUptimeEntry } from "@/lib/useSiteHistories";
import { buildUptimeView, formatUptimePercent } from "@/lib/uptime";
import { StatusBadge } from "./StatusBadge";
import { UptimeBar, UptimeBarSkeleton } from "./UptimeBar";
import { IncidentPanel } from "./IncidentPanel";
import { Card, CardBody, Modal } from "@/components/ui";

function displayHost(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export interface SiteCardProps {
  site: Site;
  history: SiteUptimeEntry | undefined;
}

const SiteCardInner = function SiteCard({ site, history }: SiteCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const hasIncident = site.status.status === "down";

  const uptime = history?.window
    ? buildUptimeView(history.window, {
        checkIntervalMinutes: site.check_frequency_minutes,
        monitoredSinceMs: Date.parse(site.created_at),
      })
    : null;

  return (
    <Card interactive className="flex h-full flex-col">
      <CardBody className="flex-1 space-y-4">
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
          <span className="text-ink-subtle">Uptime</span>
          <div className="flex items-center gap-3">
            <span className="font-medium text-ink-muted">
              {uptime
                ? formatUptimePercent(uptime.percent)
                : history?.loading || history === undefined
                  ? "-"
                  : "No data yet"}
            </span>
            {hasIncident && (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="focus-ring rounded-xs py-2 -my-2 text-sm font-medium text-accent hover:text-accent-hover"
              >
                Show details
              </button>
            )}
          </div>
        </div>

        {history?.error ? (
          <p className="text-xs text-ink-subtle">Couldn&apos;t load uptime history</p>
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

      {hasIncident && (
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={site.name}>
          <IncidentPanel status={site.status} />
        </Modal>
      )}

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
            {site.status.latency_ms !== null ? `${site.status.latency_ms} ms` : "-"}
          </p>
        </div>
      </div>
    </Card>
  );
};

export const SiteCard = memo(SiteCardInner);
