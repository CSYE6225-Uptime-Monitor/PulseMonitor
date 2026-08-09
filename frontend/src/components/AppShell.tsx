"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { User } from "@/lib/api";
import { Wordmark } from "./Wordmark";
import { Skeleton } from "@/components/ui";

interface AppShellProps {
  user: User;
  onLogout: () => void | Promise<void>;
  children: ReactNode;
}

function initials(user: User): string {
  const raw = `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase();
  return raw || (user.email?.[0]?.toUpperCase() ?? "?");
}

function UserMenu({ user, onLogout }: { user: User; onLogout: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email} — account menu`}
        className="focus-ring flex h-8 w-8 items-center justify-center rounded-full border border-hairline-strong bg-surface-subtle font-mono text-xs font-medium tracking-wide text-ink transition-colors hover:border-ink-subtle hover:bg-surface-hover"
      >
        {initials(user)}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-48 rounded-sm border border-hairline bg-surface shadow-card-hover"
        >
          <div className="border-b border-hairline px-3 py-2.5">
            <p className="truncate text-xs font-medium text-ink">
              {[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}
            </p>
            <p className="truncate text-xs text-ink-subtle">{user.email}</p>
          </div>

          <div className="py-1">
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="focus-ring block w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface-hover"
            >
              Account
            </Link>
          </div>

          <div className="border-t border-hairline py-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); void onLogout(); }}
              className="focus-ring block w-full px-3 py-2 text-left text-sm text-accent hover:bg-accent-wash"
            >
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AppShell({ user, onLogout, children }: AppShellProps) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-hairline bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/dashboard" className="focus-ring shrink-0 rounded-xs">
            <Wordmark />
          </Link>

          <div className="ml-auto">
            <UserMenu user={user} onLogout={onLogout} />
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
