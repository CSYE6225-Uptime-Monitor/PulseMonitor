"use client";

import { useRedirectIfAuthenticated, useRequireAuth } from "@/lib/auth";

// The app root is a router, not a landing page. These two hooks are exact
// complements once auth resolves - a signed-in visitor goes to /dashboard,
// everyone else to /login - so the only state this ever renders is the
// interim "Loading...", matching every other guarded page in the app.
export default function Home() {
  useRequireAuth();
  useRedirectIfAuthenticated();

  return <p className="p-8 text-zinc-600 dark:text-zinc-400">Loading...</p>;
}
