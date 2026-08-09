import { describe, it, expect } from "vitest";
import {
  buildAxisLabels,
  buildUptimeBuckets,
  buildUptimeView,
  computeUptimePercent,
  formatUptimePercent,
  formatWindowLabel,
  pickHistoryWindow,
  summarizeOutages,
  type UptimeBucket,
} from "./uptime";
import type { HistoryRecord } from "./sites";

const HOUR = 3_600_000;
const MIN = 60_000;

function record(overrides: Partial<HistoryRecord> & { checked_at: string; status: "up" | "down" }): HistoryRecord {
  return {
    check_id: crypto.randomUUID(),
    site_id: "site-1",
    url: "https://example.com",
    status_code: overrides.status === "up" ? 200 : 500,
    latency_ms: 120,
    error_type: null,
    error_message: null,
    region: "us-east-1",
    ...overrides,
  };
}

describe("pickHistoryWindow", () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);

  it("shrinks the window for frequent checks so 100 records still cover it", () => {
    expect(pickHistoryWindow(5, now).spanMs).toBe(96 * 5 * MIN); // 8h
    expect(pickHistoryWindow(10, now).spanMs).toBe(96 * 10 * MIN); // 16h
  });

  it("caps the window at 24 hours for infrequent checks", () => {
    expect(pickHistoryWindow(15, now).spanMs).toBe(24 * HOUR);
    expect(pickHistoryWindow(60, now).spanMs).toBe(24 * HOUR);
    expect(pickHistoryWindow(1440, now).spanMs).toBe(24 * HOUR);
  });

  it("anchors the window to now", () => {
    const { fromMs, toMs, spanMs } = pickHistoryWindow(60, now);
    expect(toMs).toBe(now);
    expect(fromMs).toBe(now - spanMs);
  });

  it("widens the window to include the last check when it falls outside the frequency-based span", () => {
    // 5-minute frequency normally yields an 8h window, but the last real
    // check was 11h ago - the window should widen to cover it instead of
    // reporting "no data" for a site that actually has history.
    const lastCheckedAtMs = now - 11 * HOUR;
    const { spanMs, fromMs } = pickHistoryWindow(5, now, lastCheckedAtMs);
    expect(spanMs).toBe(11 * HOUR);
    expect(fromMs).toBe(lastCheckedAtMs);
  });

  it("still caps the widened window at 24 hours", () => {
    const lastCheckedAtMs = now - 30 * HOUR;
    expect(pickHistoryWindow(5, now, lastCheckedAtMs).spanMs).toBe(24 * HOUR);
  });

  it("leaves the frequency-based span untouched when the last check is recent", () => {
    const lastCheckedAtMs = now - 1 * MIN;
    expect(pickHistoryWindow(5, now, lastCheckedAtMs).spanMs).toBe(96 * 5 * MIN);
  });
});

describe("buildUptimeBuckets", () => {
  const fromMs = Date.UTC(2026, 0, 1, 0, 0, 0);
  const toMs = Date.UTC(2026, 0, 2, 0, 0, 0); // 24h window
  const bucketCount = 48; // 30-minute buckets

  it("renders every bucket as empty when there is no history at all", () => {
    const buckets = buildUptimeBuckets({ records: [], fromMs, toMs, checkIntervalMinutes: 5, bucketCount });
    expect(buckets).toHaveLength(bucketCount);
    expect(buckets.every((b) => b.state === "empty")).toBe(true);
    expect(buckets.every((b) => b.checks === 0)).toBe(true);
  });

  it("carries a single check for a 1440-minute site across the whole window", () => {
    // One check at the very start of the window; interval is 1440 min (once a day).
    const records = [record({ checked_at: new Date(fromMs + 5 * MIN).toISOString(), status: "up" })];
    const buckets = buildUptimeBuckets({ records, fromMs, toMs, checkIntervalMinutes: 1440, bucketCount });

    const hit = buckets.findIndex((b) => b.checks > 0);
    expect(hit).toBeGreaterThanOrEqual(0);
    // Everything from the hit bucket onward should read "up" (carried or real).
    expect(buckets.slice(hit).every((b) => b.state === "up")).toBe(true);
  });

  it("does not carry a stale check forward past two missed intervals", () => {
    // 5-minute cadence; a single check near the start should NOT carry all
    // the way to the end of a 24h window (that's 288 missed intervals).
    const records = [record({ checked_at: new Date(fromMs + 5 * MIN).toISOString(), status: "up" })];
    const buckets = buildUptimeBuckets({ records, fromMs, toMs, checkIntervalMinutes: 5, bucketCount });

    const lastBucket = buckets[buckets.length - 1];
    expect(lastBucket.state).toBe("empty");
    expect(lastBucket.carried).toBe(false);
  });

  it("marks a bucket with both passing and failing checks as partial, not up or down", () => {
    const bucketStartMs = fromMs; // first bucket: [fromMs, fromMs + 30min)
    const records = [
      record({ checked_at: new Date(bucketStartMs + 2 * MIN).toISOString(), status: "up" }),
      record({ checked_at: new Date(bucketStartMs + 10 * MIN).toISOString(), status: "down" }),
    ];
    const buckets = buildUptimeBuckets({ records, fromMs, toMs, checkIntervalMinutes: 5, bucketCount });

    expect(buckets[0].state).toBe("partial");
    expect(buckets[0].checks).toBe(2);
    expect(buckets[0].downChecks).toBe(1);
  });

  it("treats a mixed bucket's carried state as down, not up", () => {
    const bucketStartMs = fromMs;
    const records = [
      record({ checked_at: new Date(bucketStartMs + 2 * MIN).toISOString(), status: "up" }),
      record({ checked_at: new Date(bucketStartMs + 10 * MIN).toISOString(), status: "down" }),
    ];
    // 30-minute cadence -> carry limit covers the next bucket.
    const buckets = buildUptimeBuckets({ records, fromMs, toMs, checkIntervalMinutes: 30, bucketCount });

    expect(buckets[0].state).toBe("partial");
    expect(buckets[1].state).toBe("down");
    expect(buckets[1].carried).toBe(true);
  });

  it("marks buckets before monitoredSinceMs as empty regardless of carry logic", () => {
    const monitoredSinceMs = fromMs + 6 * HOUR;
    const records = [record({ checked_at: new Date(monitoredSinceMs + 5 * MIN).toISOString(), status: "up" })];
    const buckets = buildUptimeBuckets({
      records,
      fromMs,
      toMs,
      checkIntervalMinutes: 5,
      bucketCount,
      monitoredSinceMs,
    });

    const beforeCreation = buckets.filter((b) => b.endMs <= monitoredSinceMs);
    expect(beforeCreation.every((b) => b.state === "empty")).toBe(true);
    const afterCreation = buckets.filter((b) => b.startMs >= monitoredSinceMs);
    expect(afterCreation.some((b) => b.state === "up")).toBe(true);
  });

  it("skips records that fall outside the [fromMs, toMs] range instead of throwing", () => {
    const records = [
      record({ checked_at: new Date(fromMs - HOUR).toISOString(), status: "down" }),
      record({ checked_at: new Date(toMs + HOUR).toISOString(), status: "down" }),
    ];
    const buckets = buildUptimeBuckets({ records, fromMs, toMs, checkIntervalMinutes: 5, bucketCount });
    expect(buckets.every((b) => b.checks === 0)).toBe(true);
  });
});

describe("computeUptimePercent", () => {
  it("returns null (not 0) when there is no data", () => {
    expect(computeUptimePercent([])).toBeNull();
  });

  it("returns 100 when every check passed", () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      record({ checked_at: new Date(Date.now() + i * MIN).toISOString(), status: "up" })
    );
    expect(computeUptimePercent(records)).toBe(100);
  });

  it("returns 0 when every check failed", () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      record({ checked_at: new Date(Date.now() + i * MIN).toISOString(), status: "down" })
    );
    expect(computeUptimePercent(records)).toBe(0);
  });

  it("clamps to 99 rather than rounding up to a reassuring 100%", () => {
    const records = [
      ...Array.from({ length: 499 }, (_, i) => record({ checked_at: new Date(i * MIN).toISOString(), status: "up" })),
      record({ checked_at: new Date(499 * MIN).toISOString(), status: "down" }),
    ];
    expect(computeUptimePercent(records)).toBe(99);
  });

  it("clamps to 1 rather than rounding down to a false 0%", () => {
    const records = [
      ...Array.from(
        { length: 499 },
        (_, i) => record({ checked_at: new Date(i * MIN).toISOString(), status: "down" })
      ),
      record({ checked_at: new Date(499 * MIN).toISOString(), status: "up" }),
    ];
    expect(computeUptimePercent(records)).toBe(1);
  });
});

describe("formatUptimePercent", () => {
  it("renders null as a data-pending message", () => {
    expect(formatUptimePercent(null)).toBe("No data yet");
  });

  it("renders a number as a percentage", () => {
    expect(formatUptimePercent(97)).toBe("97%");
  });
});

describe("formatWindowLabel", () => {
  it("renders sub-24h spans in hours", () => {
    expect(formatWindowLabel(8 * HOUR)).toBe("Last 8 hours");
  });

  it("renders a full day as 'Last 24 hours'", () => {
    expect(formatWindowLabel(24 * HOUR)).toBe("Last 24 hours");
  });
});

describe("buildAxisLabels", () => {
  it("returns the requested number of evenly spaced labels, both ends inclusive", () => {
    const fromMs = Date.UTC(2026, 0, 1, 0, 0, 0);
    const toMs = Date.UTC(2026, 0, 1, 12, 0, 0);
    const labels = buildAxisLabels(fromMs, toMs, 7);
    expect(labels).toHaveLength(7);
  });
});

describe("buildUptimeView", () => {
  it("composes buckets, percent, window label, axis labels, and summary from one window", () => {
    const fromMs = Date.UTC(2026, 0, 1, 0, 0, 0);
    const toMs = Date.UTC(2026, 0, 2, 0, 0, 0);
    const records = [record({ checked_at: new Date(fromMs + 5 * MIN).toISOString(), status: "up" })];

    const view = buildUptimeView(
      { records, fromMs, toMs, spanMs: toMs - fromMs },
      { checkIntervalMinutes: 5 }
    );

    expect(view.buckets).toHaveLength(48);
    expect(view.percent).toBe(100);
    expect(view.windowLabel).toBe("Last 24 hours");
    expect(view.axisLabels).toHaveLength(7);
    expect(view.summary).toContain("100% of checks succeeded");
    expect(view.outageDetails).toHaveLength(0);
  });
});

describe("summarizeOutages", () => {
  function bucket(state: UptimeBucket["state"], label: string): UptimeBucket {
    return {
      key: label,
      state,
      label,
      startMs: 0,
      endMs: 0,
      checks: state === "empty" ? 0 : 1,
      downChecks: state === "down" ? 1 : 0,
      carried: false,
      tooltip: "",
    };
  }

  it("returns no outages for an all-up strip", () => {
    const buckets = [bucket("up", "09:00"), bucket("up", "09:30"), bucket("up", "10:00")];
    expect(summarizeOutages(buckets)).toHaveLength(0);
  });

  it("reports a closed outage window", () => {
    const buckets = [bucket("up", "09:00"), bucket("down", "09:30"), bucket("down", "10:00"), bucket("up", "10:30")];
    const outages = summarizeOutages(buckets);
    expect(outages).toHaveLength(1);
    expect(outages[0]).toContain("09:30");
    expect(outages[0]).toContain("10:30");
  });

  it("reports an ongoing outage that never recovers", () => {
    const buckets = [bucket("up", "09:00"), bucket("down", "09:30")];
    const outages = summarizeOutages(buckets);
    expect(outages).toHaveLength(1);
    expect(outages[0]).toContain("ongoing");
  });
});
