import type { DataExport } from "@/lib/account";

interface ExportListProps {
  exports: DataExport[];
  loading: boolean;
  error: string | null;
  onDownload: (exportId: string) => void;
  downloadingId: string | null;
}

export function ExportList({ exports, loading, error, onDownload, downloadingId }: ExportListProps) {
  if (loading) {
    return <p>Loading exports...</p>;
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }

  if (exports.length === 0) {
    return <p>No exports yet. Request one to download a copy of your data.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Requested</th>
          <th>Status</th>
          <th>Download</th>
        </tr>
      </thead>
      <tbody>
        {exports.map((item) => {
          const isDownloading = downloadingId === item.export_id;
          return (
            <tr key={item.export_id}>
              <td>{new Date(item.created_at).toLocaleString()}</td>
              <td>{item.status === "ready" ? "Ready" : item.status}</td>
              <td>
                <button type="button" onClick={() => onDownload(item.export_id)} disabled={isDownloading}>
                  {isDownloading ? "Preparing..." : "Download"}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
