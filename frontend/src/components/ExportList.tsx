import type { DataExport } from "@/lib/account";
import { Alert, Badge, Button, EmptyState, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

interface ExportListProps {
  exports: DataExport[];
  loading: boolean;
  error: string | null;
  onDownload: (exportId: string) => void;
  downloadingId: string | null;
}

export function ExportList({ exports, loading, error, onDownload, downloadingId }: ExportListProps) {
  if (loading) {
    return (
      <p role="status" className="text-sm text-ink-subtle">
        Loading exports...
      </p>
    );
  }

  if (error) {
    return <Alert tone="error">{error}</Alert>;
  }

  if (exports.length === 0) {
    return <EmptyState title="No exports yet." description="Request one to download a copy of your data." />;
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Requested</TH>
          <TH>Status</TH>
          <TH align="right">Download</TH>
        </TR>
      </THead>
      <TBody>
        {exports.map((item) => {
          const isDownloading = downloadingId === item.export_id;
          return (
            <TR key={item.export_id}>
              <TD strong>{new Date(item.created_at).toLocaleString()}</TD>
              <TD>
                <Badge tone={item.status === "ready" ? "up" : "neutral"} dot>
                  {item.status === "ready" ? "Ready" : item.status}
                </Badge>
              </TD>
              <TD className="text-right">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onDownload(item.export_id)}
                  disabled={isDownloading}
                  loading={isDownloading}
                >
                  {isDownloading ? "Preparing..." : "Download"}
                </Button>
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
