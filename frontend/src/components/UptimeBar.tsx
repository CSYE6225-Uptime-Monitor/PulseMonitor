import type { BucketState, UptimeBucket } from "@/lib/uptime";
import { cn } from "@/lib/cn";

const SKELETON_SLOTS = Array.from({ length: 48 }, (_, i) => i);

const BAR_COLOR: Record<BucketState, string> = {
  up: "bg-up-bar",
  down: "bg-down-bar",
  partial: "bg-partial-bar",
  empty: "bg-empty-bar",
};

export interface UptimeBarProps {
  buckets: readonly UptimeBucket[];
  /** Evenly spaced time labels; odd indices are hidden below `sm`. */
  axisLabels: readonly string[];
  /** Single sentence read by screen readers in place of the graphic. */
  summary: string;
  /** Extra sr-only sentences, e.g. one per outage. */
  details?: readonly string[];
  /** Desaturates the whole strip for paused sites. */
  muted?: boolean;
  className?: string;
}

/**
 * Pure presentational strip - takes pre-computed buckets only, never
 * HistoryRecord. That's the seam that lets a future daily-rollup endpoint
 * feed this component without a rewrite: it only has to emit
 * UptimeBucket[], and the axis label strings go from times to dates.
 */
export function UptimeBar({ buckets, axisLabels, summary, details = [], muted = false, className }: UptimeBarProps) {
  return (
    <div className={className}>
      <div
        role="img"
        aria-label={summary}
        className={cn("flex h-9 w-full items-stretch gap-[2px] sm:gap-[3px]", muted && "opacity-40 grayscale")}
      >
        {buckets.map((bucket, index) => {
          const edgeCount = Math.max(1, Math.round(buckets.length * 0.1));
          const isNearStart = index < edgeCount;
          const isNearEnd = index >= buckets.length - edgeCount;
          return (
            <div key={bucket.key} className="group/bar relative min-w-0 flex-1">
              <div
                data-state={bucket.state}
                className={cn(
                  "h-full min-w-0 rounded-[2px] transition-opacity duration-150 group-hover/bar:opacity-60",
                  BAR_COLOR[bucket.state]
                )}
              />
              <span
                role="tooltip"
                className={cn(
                  "pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-control border border-hairline bg-surface px-2 py-1 text-[11px] leading-none text-ink opacity-0 shadow-card-hover transition-opacity duration-100 group-hover/bar:opacity-100",
                  isNearStart && "left-0",
                  isNearEnd && "right-0",
                  !isNearStart && !isNearEnd && "left-1/2 -translate-x-1/2"
                )}
              >
                {bucket.tooltip}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex w-full justify-between text-[11px] leading-none tabular-nums text-ink-subtle">
        {axisLabels.map((label, index) => (
          <span key={`${label}-${index}`} className={index % 2 === 1 ? "hidden sm:inline" : undefined}>
            {label}
          </span>
        ))}
      </div>

      {details.length > 0 && (
        <ul className="sr-only">
          {details.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function UptimeBarSkeleton({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <div className="flex h-9 w-full animate-pulse items-stretch gap-[2px] sm:gap-[3px]">
        {SKELETON_SLOTS.map((i) => (
          <div key={i} className="min-w-0 flex-1 rounded-[2px] bg-surface-hover" />
        ))}
      </div>
      <div className="mt-2 h-[11px] w-full animate-pulse rounded bg-surface-hover" />
    </div>
  );
}
