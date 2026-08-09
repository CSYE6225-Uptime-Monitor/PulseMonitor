import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "up" | "down" | "unknown" | "neutral" | "accent";

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
}

const BADGE_BASE = "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-xs font-medium";

const BADGE_TONES: Record<BadgeTone, string> = {
  up: "border-up-hairline bg-up-wash text-up",
  down: "border-down-hairline bg-down-wash text-down",
  unknown: "border-unknown-hairline bg-unknown-wash text-unknown",
  neutral: "border-hairline bg-surface-subtle text-ink-muted",
  accent: "border-accent-hairline bg-accent-wash text-accent",
};

const BADGE_DOTS: Record<BadgeTone, string> = {
  up: "bg-up-bar",
  down: "bg-down-bar",
  unknown: "bg-unknown-bar animate-pulse",
  neutral: "bg-ink-faint",
  accent: "bg-accent",
};

/**
 * The label must stay a direct text child of the outer span (the dot is an
 * empty aria-hidden sibling) so `getByText(label)` resolves to the element
 * carrying `data-status`, not a wrapper - StatusBadge.test.tsx depends on this.
 */
export function Badge({ tone = "neutral", dot = false, className, children, ...rest }: BadgeProps) {
  return (
    <span className={cn(BADGE_BASE, BADGE_TONES[tone], className)} {...rest}>
      {dot && <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", BADGE_DOTS[tone])} />}
      {children}
    </span>
  );
}
