"use client";

import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

// Mirrors primary Button styling — works on an <a> element
const PRIMARY_LINK_CLS =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control " +
  "h-10 px-4 text-sm font-medium bg-accent text-white shadow-control " +
  "transition-colors hover:bg-accent-hover active:bg-accent-active focus-ring";

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

      {/* ── Main content placeholder ────────────────────────── */}
      <main className="flex-1" />

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
