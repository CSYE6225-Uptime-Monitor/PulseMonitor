import { ACTIVITY_EVENT_LABELS, type ActivityEvent } from "@/lib/account";
import { Badge, Button, EmptyState, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

interface ActivityTableProps {
  events: ActivityEvent[];
  nextCursor: string | null;
  onLoadMore: () => void;
  loadingMore?: boolean;
}

export function ActivityTable({ events, nextCursor, onLoadMore, loadingMore = false }: ActivityTableProps) {
  if (events.length === 0) {
    return <EmptyState title="No account activity yet." />;
  }

  return (
    <div>
      <Table>
        <THead>
          <TR>
            <TH>When</TH>
            <TH>Event</TH>
            <TH>Resource</TH>
            <TH>Outcome</TH>
          </TR>
        </THead>
        <TBody>
          {events.map((event) => (
            <TR key={event.event_id}>
              <TD strong>{new Date(event.occurred_at).toLocaleString()}</TD>
              <TD>{ACTIVITY_EVENT_LABELS[event.event_type] ?? event.event_type}</TD>
              <TD>{event.resource_id ?? "-"}</TD>
              <TD data-outcome={event.outcome}>
                <Badge tone={event.outcome === "success" ? "neutral" : "down"} dot={event.outcome === "failure"}>
                  {event.outcome === "success" ? "Success" : "Failed"}
                </Badge>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      {nextCursor !== null && (
        <div className="flex justify-center border-t border-hairline bg-surface-subtle px-6 py-3">
          <Button variant="secondary" size="sm" onClick={onLoadMore} disabled={loadingMore} loading={loadingMore}>
            {loadingMore ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
