import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("./account", () => ({
  createExport: vi.fn(),
  listExports: vi.fn(),
  getExportDownloadUrl: vi.fn(),
}));
vi.mock("./download", () => ({
  startDownload: vi.fn(),
}));

import { createExport, listExports, getExportDownloadUrl } from "./account";
import { startDownload } from "./download";
import { ApiError } from "./api";
import { useExports } from "./useExports";
import type { DataExport } from "./account";

const exampleExport: DataExport = {
  export_id: "1700000000000-abcdef12",
  status: "ready",
  created_at: "2026-01-01T00:00:00.000Z",
  size_bytes: 1024,
};

describe("useExports", () => {
  beforeEach(() => {
    vi.mocked(listExports).mockReset();
    vi.mocked(createExport).mockReset();
    vi.mocked(getExportDownloadUrl).mockReset();
    vi.mocked(startDownload).mockReset();
  });

  it("starts loading, then populates exports from the initial list", async () => {
    vi.mocked(listExports).mockResolvedValue([exampleExport]);

    const { result } = renderHook(() => useExports());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.exports).toEqual([exampleExport]);
    expect(result.current.error).toBeNull();
  });

  it("surfaces the ApiError message when the initial list fails", async () => {
    vi.mocked(listExports).mockRejectedValue(new ApiError(401, "Authentication required."));

    const { result } = renderHook(() => useExports());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Authentication required.");
    expect(result.current.exports).toEqual([]);
  });

  it("requestExport creates an export, then re-lists", async () => {
    vi.mocked(listExports).mockResolvedValueOnce([]);
    const { result } = renderHook(() => useExports());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(createExport).mockResolvedValueOnce(exampleExport);
    vi.mocked(listExports).mockResolvedValueOnce([exampleExport]);

    await act(async () => {
      await result.current.requestExport();
    });

    expect(createExport).toHaveBeenCalledTimes(1);
    expect(listExports).toHaveBeenCalledTimes(2);
    expect(result.current.exports).toEqual([exampleExport]);
  });

  it("requestExport failure sets actionError, not error, and leaves the list alone", async () => {
    vi.mocked(listExports).mockResolvedValueOnce([exampleExport]);
    const { result } = renderHook(() => useExports());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(createExport).mockRejectedValueOnce(new ApiError(429, "Too many requests."));

    await act(async () => {
      await result.current.requestExport();
    });

    expect(result.current.actionError).toBe("Too many requests.");
    expect(result.current.error).toBeNull();
    expect(result.current.exports).toEqual([exampleExport]);
  });

  it("sets requesting true during the create call and false after", async () => {
    vi.mocked(listExports).mockResolvedValue([]);
    const { result } = renderHook(() => useExports());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let resolveCreate: (value: DataExport) => void;
    vi.mocked(createExport).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve;
      })
    );

    let requestPromise!: Promise<void>;
    act(() => {
      requestPromise = result.current.requestExport();
    });

    await waitFor(() => expect(result.current.requesting).toBe(true));

    await act(async () => {
      resolveCreate(exampleExport);
      await requestPromise;
    });

    expect(result.current.requesting).toBe(false);
  });

  it("download fetches the presigned url and starts the download", async () => {
    vi.mocked(listExports).mockResolvedValue([exampleExport]);
    const { result } = renderHook(() => useExports());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(getExportDownloadUrl).mockResolvedValueOnce({
      url: "https://s3.example.com/signed",
      expires_at: "2026-01-01T00:05:00.000Z",
      filename: "x.json",
    });

    await act(async () => {
      await result.current.download(exampleExport.export_id);
    });

    expect(getExportDownloadUrl).toHaveBeenCalledWith(exampleExport.export_id);
    expect(startDownload).toHaveBeenCalledWith("https://s3.example.com/signed");
  });

  it("download failure sets actionError, not error", async () => {
    vi.mocked(listExports).mockResolvedValue([exampleExport]);
    const { result } = renderHook(() => useExports());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(getExportDownloadUrl).mockRejectedValueOnce(new ApiError(404, "Export not found."));

    await act(async () => {
      await result.current.download(exampleExport.export_id);
    });

    expect(result.current.actionError).toBe("Export not found.");
    expect(result.current.error).toBeNull();
    expect(startDownload).not.toHaveBeenCalled();
  });

  it("sets downloadingId during the download fetch and clears it after", async () => {
    vi.mocked(listExports).mockResolvedValue([exampleExport]);
    const { result } = renderHook(() => useExports());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let resolveDownload: (value: { url: string; expires_at: string; filename: string }) => void;
    vi.mocked(getExportDownloadUrl).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDownload = resolve;
      })
    );

    let downloadPromise!: Promise<void>;
    act(() => {
      downloadPromise = result.current.download(exampleExport.export_id);
    });

    await waitFor(() => expect(result.current.downloadingId).toBe(exampleExport.export_id));

    await act(async () => {
      resolveDownload({ url: "https://s3.example.com/signed", expires_at: "x", filename: "x.json" });
      await downloadPromise;
    });

    expect(result.current.downloadingId).toBeNull();
  });
});
