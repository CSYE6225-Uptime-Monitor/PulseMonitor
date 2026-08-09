import { memo } from "react";
import type { HistoryRecord } from "@/lib/sites";
import { Badge, Button, EmptyState, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

// One formatter instance per module load avoids `Intl.DateTimeFormat`
// construction on every cell in the 100-row table.
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "short",
  timeStyle: "short",
});

interface HistoryTableProps {
  records: HistoryRecord[];
  nextCursor: string | null;
  onLoadMore: () => void;
  loadingMore?: boolean;
}

function HistoryTableInner({ records, nextCursor, onLoadMore, loadingMore = false }: HistoryTableProps) {
  if (records.length === 0) {
    return <EmptyState title="No history yet" />;
  }

  return (
    <div>
      <Table>
        <THead>
          <TR>
            <TH>Checked at</TH>
            <TH>Status</TH>
            <TH align="right" className="hidden sm:table-cell">Status code</TH>
            <TH align="right">Latency</TH>
            <TH className="hidden sm:table-cell">Error</TH>
          </TR>
        </THead>
        <TBody>
          {records.map((record) => (
            <TR key={record.check_id}>
              <TD strong>{dateFormatter.format(new Date(record.checked_at))}</TD>
              <TD>
                <Badge tone={record.status} dot>
                  {record.status === "up" ? "Up" : "Down"}
                </Badge>
              </TD>
              <TD numeric className="hidden sm:table-cell">{record.status_code ?? "-"}</TD>
              <TD numeric>{record.latency_ms !== null ? `${record.latency_ms} ms` : "-"}</TD>
              <TD className="hidden sm:table-cell">{record.error_message ?? "-"}</TD>
            </TR>
          ))}
        </TBody>
      </Table>

      {nextCursor !== null && (
        <div className="flex justify-center border-t border-hairline bg-surface-subtle px-6 py-3">
          <Button variant="secondary" size="sm" onClick={onLoadMore} disabled={loadingMore} loading={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

export const HistoryTable = memo(HistoryTableInner);
