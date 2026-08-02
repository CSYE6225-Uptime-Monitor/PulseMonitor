import type { SiteStatusValue } from "@/lib/sites";

interface StatusBadgeProps {
  status: SiteStatusValue;
}

const LABELS: Record<SiteStatusValue, string> = {
  up: "Up",
  down: "Down",
  unknown: "Unknown",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span data-status={status}>{LABELS[status]}</span>;
}
