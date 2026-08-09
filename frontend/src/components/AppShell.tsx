"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { User } from "@/lib/api";
import { Button } from "@/components/ui";
import { NavLink } from "./NavLink";
import { Wordmark } from "./Wordmark";
import { Skeleton } from "@/components/ui";

interface AppShellProps {
  user: User;
  onLogout: () => void | Promise<void>;
  children: ReactNode;
}

export function AppShell({ user, onLogout, children }: AppShellProps) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-hairline bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/dashboard" className="focus-ring shrink-0 rounded-xs">
            <Wordmark />
          </Link>

          <nav aria-label="Main" className="flex items-center gap-1">
            <NavLink href="/dashboard">Dashboard</NavLink>
            <NavLink href="/account">Account</NavLink>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-ink-subtle sm:inline">
              {user.first_name} {user.last_name}
            </span>
            <Button variant="secondary" size="sm" onClick={() => void onLogout()}>
              Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}

/** Chrome without nav/user, shown while auth resolves. */
export function AppShellFallback() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-4 sm:px-6">
          <Wordmark />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <div role="status" className="space-y-4">
          <span className="sr-only">Loading…</span>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      </main>
    </div>
  );
}
