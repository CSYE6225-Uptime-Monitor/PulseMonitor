"use client";

import { useRedirectIfAuthenticated, useRequireAuth } from "@/lib/auth";
import { Wordmark } from "@/components/Wordmark";

// The app root is a router, not a landing page. These two hooks are exact
// complements once auth resolves - a signed-in visitor goes to /dashboard,
// everyone else to /login - so the only state this ever renders is this
// interim loading gate.
export default function Home() {
  useRequireAuth();
  useRedirectIfAuthenticated();

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-canvas" role="status" aria-busy="true">
      <div className="flex flex-col items-center gap-3">
        <Wordmark size="lg" />
        <div className="flex items-center gap-1" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-1.5 animate-pulse rounded-full bg-ink-faint"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
        <span className="sr-only">Loading PulseMonitor</span>
      </div>
    </div>
  );
}
