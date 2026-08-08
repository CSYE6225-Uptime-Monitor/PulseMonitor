import { ACTIVITY_EVENT_LABELS, type ActivityEvent } from "@/lib/account";

interface ActivityTableProps {
  events: ActivityEvent[];
  nextCursor: string | null;
  onLoadMore: () => void;
  loadingMore?: boolean;
}

export function ActivityTable({ events, nextCursor, onLoadMore, loadingMore = false }: ActivityTableProps) {
  if (events.length === 0) {
    return <p>No account activity yet.</p>;
  }

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Event</th>
            <th>Resource</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.event_id}>
              <td>{new Date(event.occurred_at).toLocaleString()}</td>
              <td>{ACTIVITY_EVENT_LABELS[event.event_type] ?? event.event_type}</td>
              <td>{event.resource_id ?? "—"}</td>
              <td data-outcome={event.outcome}>{event.outcome === "success" ? "Success" : "Failed"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {nextCursor !== null && (
        <button type="button" onClick={onLoadMore} disabled={loadingMore}>
          {loadingMore ? "Loading..." : "Load more"}
        </button>
      )}
    </div>
  );
}
