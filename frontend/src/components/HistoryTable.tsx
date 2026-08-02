import type { HistoryRecord } from "@/lib/sites";

interface HistoryTableProps {
  records: HistoryRecord[];
  nextCursor: string | null;
  onLoadMore: () => void;
  loadingMore?: boolean;
}

export function HistoryTable({ records, nextCursor, onLoadMore, loadingMore = false }: HistoryTableProps) {
  if (records.length === 0) {
    return <p>No history yet.</p>;
  }

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>Checked at</th>
            <th>Status</th>
            <th>Status code</th>
            <th>Latency</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.check_id}>
              <td>{new Date(record.checked_at).toLocaleString()}</td>
              <td>{record.status === "up" ? "Up" : "Down"}</td>
              <td>{record.status_code ?? "—"}</td>
              <td>{record.latency_ms !== null ? `${record.latency_ms} ms` : "—"}</td>
              <td>{record.error_message ?? "—"}</td>
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
