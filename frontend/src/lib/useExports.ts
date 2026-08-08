import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";
import { createExport, getExportDownloadUrl, listExports, type DataExport } from "./account";
import { startDownload } from "./download";

interface UseExportsResult {
  exports: DataExport[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  requestExport: () => Promise<void>;
  requesting: boolean;
  download: (exportId: string) => Promise<void>;
  downloadingId: string | null;
  actionError: string | null;
}

// No polling: exports are created synchronously (backend/src/services/exportService.js
// writes the object before responding), so `status` is always "ready" by the
// time requestExport()'s own re-list runs - there is nothing to wait for.
export function useExports(): UseExportsResult {
  const [exports, setExports] = useState<DataExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listExports();
      setExports(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load exports.");
    } finally {
      setLoading(false);
    }
  }, []);

  // requestExport/download failures land in actionError, not error: a failed
  // action shouldn't replace an already-visible, still-valid list the way a
  // failed list load does (mirrors SiteList's error prop vs a form's own
  // error banner).
  const requestExport = useCallback(async () => {
    setRequesting(true);
    setActionError(null);
    try {
      await createExport();
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to request export.");
    } finally {
      setRequesting(false);
    }
  }, [refresh]);

  const download = useCallback(async (exportId: string) => {
    setDownloadingId(exportId);
    setActionError(null);
    try {
      const { url } = await getExportDownloadUrl(exportId);
      startDownload(url);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to download export.");
    } finally {
      setDownloadingId(null);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
    // refresh is stable (empty dep array), so this intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { exports, loading, error, refresh, requestExport, requesting, download, downloadingId, actionError };
}
