import { buildIncidentBody, getIncidentTitle, type IncidentStatus } from "@/lib/incident";

export interface IncidentPanelProps {
  status: IncidentStatus;
  id?: string;
}

export function IncidentPanel({ status, id }: IncidentPanelProps) {
  return (
    <div id={id} className="rounded-control bg-surface-subtle p-4 ring-1 ring-inset ring-hairline">
      <p className="text-sm font-semibold text-ink">{getIncidentTitle(status.error_type)}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-subtle">{buildIncidentBody(status)}</p>
    </div>
  );
}
