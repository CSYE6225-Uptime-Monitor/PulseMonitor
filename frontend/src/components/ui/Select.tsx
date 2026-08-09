import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

const SELECT_BASE =
  "block h-10 w-full appearance-none rounded-control border border-hairline-strong " +
  "bg-surface pl-3 pr-9 text-sm text-ink shadow-control transition-colors " +
  "hover:border-ink-subtle focus-ring disabled:cursor-not-allowed disabled:bg-surface-subtle";

export function Select({ invalid, className, children, ...rest }: SelectProps) {
  return (
    <div className="relative">
      <select
        className={cn(SELECT_BASE, invalid && "border-danger", className)}
        aria-invalid={invalid || undefined}
        {...rest}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
      >
        <path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}
