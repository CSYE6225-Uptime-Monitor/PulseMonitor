"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  // Exact match, plus /sites/* rolls up to Dashboard - a startsWith on
  // "/account" would also light up Account on /account/activity.
  const active = pathname === href || (href === "/dashboard" && pathname.startsWith("/sites/"));

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "focus-ring rounded-control px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-surface-hover text-ink" : "text-ink-subtle hover:bg-surface-hover hover:text-ink"
      )}
    >
      {children}
    </Link>
  );
}
