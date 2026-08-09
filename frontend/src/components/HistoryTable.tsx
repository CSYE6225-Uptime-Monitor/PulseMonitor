import type { HistoryRecord } from "@/lib/sites";
import { Badge, Button, EmptyState, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

interface HistoryTableProps {
  records: HistoryRecord[];
  nextCursor: string | null;
  onLoadMore: () => void;
  loadingMore?: boolean;
}

export function HistoryTable({ records, nextCursor, onLoadMore, loadingMore = false }: HistoryTableProps) {
  if (records.length === 0) {
    return <EmptyState title="No history yet." />;
  }

  return (
    <div>
      <Table>
        <THead>
          <TR>
            <TH>Checked at</TH>
            <TH>Status</TH>
            <TH align="right">Status code</TH>
            <TH align="right">Latency</TH>
            <TH>Error</TH>
          </TR>
        </THead>
        <TBody>
          {records.map((record) => (
            <TR key={record.check_id}>
              <TD strong>{new Date(record.checked_at).toLocaleString()}</TD>
              <TD>
                <Badge tone={record.status} dot>
                  {record.status === "up" ? "Up" : "Down"}
                </Badge>
              </TD>
              <TD numeric>{record.status_code ?? "—"}</TD>
              <TD numeric>{record.latency_ms !== null ? `${record.latency_ms} ms` : "—"}</TD>
              <TD>{record.error_message ?? "—"}</TD>
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
