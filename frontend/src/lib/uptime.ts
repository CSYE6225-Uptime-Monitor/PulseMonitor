import type { HistoryRecord, Site } from "./sites";
import { getSiteHistory } from "./sites";

export const FULL_WINDOW_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_BUCKET_COUNT = 48;

/** The API caps limit at 100 (backend/src/schemas/historySchemas.js). */
const HISTORY_PAGE_LIMIT = 100;
/** Ask for at most this many checks so one page always covers the window,
 *  leaving headroom for pings that fire slightly early. */
const MAX_CHECKS_PER_WINDOW = 96;

export type BucketState = "up" | "down" | "partial" | "empty";

export interface UptimeBucket {
  /** Stable across re-renders for the same window; used as the React key. */
  key: string;
  state: BucketState;
  /** Short axis-style time, e.g. "09:00". */
  label: string;
  startMs: number;
  endMs: number;
  checks: number;
  downChecks: number;
  /** True when no check landed here and the state was inferred from the
   *  previous known check. Kept on the type so the UI can render carried
   *  buckets differently later without a signature change. */
  carried: boolean;
  /** Human sentence for the native title tooltip. */
  tooltip: string;
}

export interface UptimeWindow {
  records: HistoryRecord[];
  fromMs: number;
  toMs: number;
  spanMs: number;
}

export interface BuildBucketsOptions {
  records: readonly HistoryRecord[];
  fromMs: number;
  toMs: number;
  /** Cadence the site is checked at; drives how far a known state carries. */
  checkIntervalMinutes: number;
  bucketCount?: number;
  /** Site created_at (ms). Buckets fully before this read "Not monitored yet". */
  monitoredSinceMs?: number;
}

/* ------------------------------------------------------------------ */
/* Window selection                                                    */
/* ------------------------------------------------------------------ */

/**
 * The history endpoint returns the OLDEST `limit` records at or after `from`,
 * so a fixed 24h window on a 5-minute site would hand back day-old checks and
 * hide everything recent behind two cursor pages. Shrinking the window to
 * what one page can hold keeps the strip anchored to *now* with one request.
 */
export function pickHistoryWindow(
  checkFrequencyMinutes: number,
  nowMs: number = Date.now()
): { fromMs: number; toMs: number; spanMs: number } {
  const intervalMs = Math.max(1, checkFrequencyMinutes) * 60_000;
  const spanMs = Math.min(FULL_WINDOW_MS, MAX_CHECKS_PER_WINDOW * intervalMs);
  return { fromMs: nowMs - spanMs, toMs: nowMs, spanMs };
}

export function formatWindowLabel(spanMs: number): string {
  const hours = Math.round(spanMs / 3_600_000);
  return hours >= 24 ? "Last 24 hours" : `Last ${hours} hours`;
}

export async function fetchUptimeWindow(site: Site, nowMs: number = Date.now()): Promise<UptimeWindow> {
  const { fromMs, toMs, spanMs } = pickHistoryWindow(site.check_frequency_minutes, nowMs);
  const page = await getSiteHistory(site.site_id, {
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    limit: HISTORY_PAGE_LIMIT,
  });
  return { records: page.records, fromMs, toMs, spanMs };
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Evenly spaced labels (both ends inclusive). The UI hides odd indices below `sm`. */
export function buildAxisLabels(fromMs: number, toMs: number, count: number = 7): string[] {
  const step = (toMs - fromMs) / (count - 1);
  return Array.from({ length: count }, (_, i) => formatClock(fromMs + i * step));
}

/* ------------------------------------------------------------------ */
/* Bucketing                                                           */
/* ------------------------------------------------------------------ */

export function buildUptimeBuckets({
  records,
  fromMs,
  toMs,
  checkIntervalMinutes,
  bucketCount = DEFAULT_BUCKET_COUNT,
  monitoredSinceMs,
}: BuildBucketsOptions): UptimeBucket[] {
  const count = Math.max(1, Math.min(96, Math.floor(bucketCount)));
  const span = Math.max(1, toMs - fromMs);
  const bucketMs = span / count;

  const up = new Array<number>(count).fill(0);
  const down = new Array<number>(count).fill(0);

  for (const rec of records) {
    const t = Date.parse(rec.checked_at);
    if (Number.isNaN(t) || t < fromMs || t > toMs) continue;
    const i = Math.min(count - 1, Math.max(0, Math.floor((t - fromMs) / bucketMs)));
    if (rec.status === "up") up[i] += 1;
    else down[i] += 1;
  }

  // A check's verdict is a statement about the site until the next check is
  // due. Carrying it forward is what makes a 12h/24h cadence render as a
  // solid strip instead of one lonely bar in a field of gray. Bounded at two
  // missed intervals: past that the site genuinely has no data.
  const carryLimitMs = 2 * Math.max(1, checkIntervalMinutes) * 60_000 + bucketMs;

  const buckets: UptimeBucket[] = [];
  let lastKnownState: "up" | "down" | null = null;
  let lastKnownAtMs = -Infinity;

  for (let i = 0; i < count; i += 1) {
    const startMs = Math.round(fromMs + i * bucketMs);
    const endMs = Math.round(fromMs + (i + 1) * bucketMs);
    const upCount = up[i];
    const downCount = down[i];
    const checks = upCount + downCount;

    let state: BucketState;
    let carried = false;

    if (checks > 0) {
      state = downCount === 0 ? "up" : upCount === 0 ? "down" : "partial";
      // Any failure in the interval is what the operator cares about, so a
      // mixed bucket carries forward as "down", never silently as "up".
      lastKnownState = downCount > 0 ? "down" : "up";
      lastKnownAtMs = endMs;
    } else if (monitoredSinceMs !== undefined && endMs <= monitoredSinceMs) {
      state = "empty"; // site did not exist yet
    } else if (lastKnownState !== null && startMs - lastKnownAtMs <= carryLimitMs) {
      state = lastKnownState;
      carried = true;
    } else {
      state = "empty";
    }

    buckets.push({
      key: `${startMs}`,
      state,
      label: formatClock(startMs),
      startMs,
      endMs,
      checks,
      downChecks: downCount,
      carried,
      tooltip: bucketTooltip({ startMs, endMs, state, checks, downChecks: downCount, carried, monitoredSinceMs }),
    });
  }

  return buckets;
}

function bucketTooltip(b: {
  startMs: number;
  endMs: number;
  state: BucketState;
  checks: number;
  downChecks: number;
  carried: boolean;
  monitoredSinceMs?: number;
}): string {
  const range = `${formatClock(b.startMs)}–${formatClock(b.endMs)}`;
  if (b.state === "empty") {
    const reason =
      b.monitoredSinceMs !== undefined && b.endMs <= b.monitoredSinceMs ? "Not monitored yet" : "No checks recorded";
    return `${range} · ${reason}`;
  }
  if (b.carried) return `${range} · ${b.state === "up" ? "Up" : "Down"} (no check in this interval)`;
  if (b.state === "partial") return `${range} · ${b.downChecks} of ${b.checks} checks failed`;
  if (b.state === "down") return `${range} · ${b.checks} failed ${b.checks === 1 ? "check" : "checks"}`;
  return `${range} · ${b.checks} successful ${b.checks === 1 ? "check" : "checks"}`;
}

/* ------------------------------------------------------------------ */
/* Percentage                                                          */
/* ------------------------------------------------------------------ */

/** null means "we have no data", which is NOT the same as 0%. */
export function computeUptimePercent(records: readonly HistoryRecord[]): number | null {
  if (records.length === 0) return null;
  const upCount = records.reduce((n, r) => n + (r.status === "up" ? 1 : 0), 0);
  if (upCount === records.length) return 100;
  if (upCount === 0) return 0;
  // Clamp so a single failure in 500 checks never rounds up to a reassuring
  // "100%", and a single success never rounds down to "0%".
  return Math.min(99, Math.max(1, Math.round((upCount / records.length) * 100)));
}

export function formatUptimePercent(percent: number | null): string {
  return percent === null ? "No data yet" : `${percent}%`;
}

/** Contiguous down runs, for the screen-reader detail and the incident panel. */
export function summarizeOutages(buckets: readonly UptimeBucket[]): string[] {
  const out: string[] = [];
  let runStart: UptimeBucket | null = null;
  for (const b of buckets) {
    const bad = b.state === "down" || b.state === "partial";
    if (bad && runStart === null) runStart = b;
    if (!bad && runStart !== null) {
      out.push(`Outage from ${runStart.label} to ${b.label}.`);
      runStart = null;
    }
  }
  if (runStart !== null) out.push(`Outage from ${runStart.label}, ongoing.`);
  return out;
}

export function buildUptimeSummary(
  buckets: readonly UptimeBucket[],
  percent: number | null,
  windowLabel: string
): string {
  if (percent === null) return `Uptime chart, ${windowLabel.toLowerCase()}. No checks recorded yet.`;
  const outages = summarizeOutages(buckets).length;
  const gaps = buckets.filter((b) => b.state === "empty").length;
  const parts = [`Uptime chart, ${windowLabel.toLowerCase()}`, `${percent}% of checks succeeded`];
  parts.push(outages === 0 ? "no outages" : `${outages} ${outages === 1 ? "outage" : "outages"}`);
  if (gaps > 0) parts.push(`${gaps} ${gaps === 1 ? "interval" : "intervals"} with no data`);
  return `${parts.join(", ")}.`;
}

/* ------------------------------------------------------------------ */
/* Composed view                                                       */
/* ------------------------------------------------------------------ */

export interface UptimeView {
  buckets: UptimeBucket[];
  percent: number | null;
  windowLabel: string;
  axisLabels: string[];
  summary: string;
  outageDetails: string[];
}

/** Everything a card or page needs to render one uptime strip, from one window. */
export function buildUptimeView(
  window: UptimeWindow,
  options: { checkIntervalMinutes: number; monitoredSinceMs?: number }
): UptimeView {
  const buckets = buildUptimeBuckets({
    records: window.records,
    fromMs: window.fromMs,
    toMs: window.toMs,
    checkIntervalMinutes: options.checkIntervalMinutes,
    monitoredSinceMs: options.monitoredSinceMs,
  });
  const percent = computeUptimePercent(window.records);
  const windowLabel = formatWindowLabel(window.spanMs);
  return {
    buckets,
    percent,
    windowLabel,
    axisLabels: buildAxisLabels(window.fromMs, window.toMs, 7),
    summary: buildUptimeSummary(buckets, percent, windowLabel),
    outageDetails: summarizeOutages(buckets),
  };
}
