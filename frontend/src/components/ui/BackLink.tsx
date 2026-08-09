import type { AnchorHTMLAttributes } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export interface BackLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
}

export function BackLink({ href, className, children, ...rest }: BackLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "focus-ring group inline-flex items-center gap-2 rounded-xs py-1 -my-1 font-mono text-xs " +
          "uppercase tracking-widest text-ink-subtle transition-colors hover:text-ink",
        className
      )}
      {...rest}
    >
      <svg
        aria-hidden="true"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        className="transition-transform group-hover:-translate-x-0.5"
      >
        <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </Link>
  );
}
