import type { SiteStatusValue } from "@/lib/sites";
import { Badge, type BadgeTone } from "@/components/ui";

interface StatusBadgeProps {
  status: SiteStatusValue;
}

const LABELS: Record<SiteStatusValue, string> = {
  up: "Up",
  down: "Down",
  unknown: "Unknown",
};

const TONES: Record<SiteStatusValue, BadgeTone> = {
  up: "up",
  down: "down",
  unknown: "unknown",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge tone={TONES[status]} dot data-status={status}>
      {LABELS[status]}
    </Badge>
  );
}
