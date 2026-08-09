"use client";

import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { UptimeBar } from "@/components/UptimeBar";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardBody } from "@/components/ui";
import type { UptimeBucket } from "@/lib/uptime";

// Mirrors primary Button styling — works on an <a> element
const PRIMARY_LINK_CLS =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control " +
  "h-10 px-4 text-sm font-medium bg-accent text-white shadow-control " +
  "transition-colors hover:bg-accent-hover active:bg-accent-active focus-ring";

// ─── demo data for hero UptimeBar (all green) ─────────────────────────────────
const now = Date.now();
const HERO_BUCKETS: UptimeBucket[] = Array.from({ length: 60 }, (_, i) => ({
  key: `hero-${i}`,
  state: "up",
  label: "",
  startMs: now - (60 - i) * 60_000,
  endMs: now - (59 - i) * 60_000,
  checks: 1,
  downChecks: 0,
  carried: false,
  tooltip: "Operational",
}));
const HERO_AXIS_LABELS = ["1h ago", "45m", "30m", "15m", "now"];
const HERO_SUMMARY = "100% uptime in the last hour — all checks passed";

// ─── demo data for features UptimeBar (one short outage) ─────────────────────
const FEATURE_BUCKETS: UptimeBucket[] = Array.from({ length: 60 }, (_, i) => ({
  key: `feat-${i}`,
  state: (i >= 30 && i <= 35 ? "down" : "up") as UptimeBucket["state"],
  label: "",
  startMs: now - (60 - i) * 60_000,
  endMs: now - (59 - i) * 60_000,
  checks: 1,
  downChecks: i >= 30 && i <= 35 ? 1 : 0,
  carried: false,
  tooltip: i >= 30 && i <= 35 ? "Outage detected" : "Operational",
}));
const FEATURE_SUMMARY = "98% uptime — one short outage detected";

const HISTORY_ROWS = [
  { time: "12:00 PM", status: "up", latency: "134 ms" },
  { time: "11:59 AM", status: "up", latency: "142 ms" },
  { time: "11:58 AM", status: "down", latency: "—" },
  { time: "11:57 AM", status: "down", latency: "—" },
  { time: "11:56 AM", status: "up", latency: "138 ms" },
];

export function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* ── Navbar ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-hairline bg-surface/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-4 sm:px-6">
          <Link href="/" className="focus-ring shrink-0 rounded-xs">
            <Wordmark size="md" />
          </Link>
          <nav aria-label="Site" className="ml-auto flex items-center gap-3">
            <Link
              href="/login"
              className="focus-ring rounded-xs text-sm font-medium text-ink-subtle transition-colors hover:text-ink"
            >
              Log in
            </Link>
            <Link href="/signup" className={PRIMARY_LINK_CLS}>
              Start monitoring
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero ───────────────────────────────────────────── */}
        <section
          data-section="hero"
          className="border-b border-hairline bg-accent-wash px-4 py-16 sm:px-6 sm:py-24"
        >
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2">
            {/* Left: copy */}
            <div>
              <h1
                className="text-5xl font-semibold tracking-tight text-ink lg:text-7xl"
                style={{ lineHeight: 1.05 }}
              >
                Know the moment your site goes down.
              </h1>
              <p className="mt-6 max-w-lg text-lg text-ink-subtle">
                PulseMonitor checks your sites every minute and sends you an email
                the second something goes wrong.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/signup"
                  className={`${PRIMARY_LINK_CLS} h-12 px-6 text-base`}
                >
                  Start monitoring — it&apos;s free
                </Link>
                <Link
                  href="/login"
                  className="focus-ring rounded-xs text-sm font-medium text-ink-subtle transition-colors hover:text-ink"
                >
                  Log in
                </Link>
              </div>
            </div>

            {/* Right: product card */}
            <div className="flex justify-center lg:justify-end">
              <div className="w-full max-w-sm rotate-1 translate-y-2 lg:max-w-none">
                <Card className="shadow-card-hover">
                  <CardBody className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-ink">my-store.com</span>
                      <StatusBadge status="up" />
                    </div>
                    <UptimeBar
                      buckets={HERO_BUCKETS}
                      axisLabels={HERO_AXIS_LABELS}
                      summary={HERO_SUMMARY}
                    />
                    <p className="text-xs text-ink-subtle">
                      Last checked: just now &middot; 142 ms
                    </p>
                  </CardBody>
                </Card>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-hairline bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-1">
              <Wordmark size="md" />
              <p className="text-xs text-ink-subtle">Uptime monitoring with email alerts.</p>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/login"
                className="focus-ring rounded-xs text-xs text-ink-subtle transition-colors hover:text-ink"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="focus-ring rounded-xs text-xs text-ink-subtle transition-colors hover:text-ink"
              >
                Sign up
              </Link>
            </div>
          </div>
          <p className="mt-6 text-xs text-ink-faint">© 2026 PulseMonitor</p>
        </div>
      </footer>
    </div>
  );
}
