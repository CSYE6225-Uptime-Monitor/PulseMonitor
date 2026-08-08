import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
  },
}));

import { api } from "./api";
import {
  ACTIVITY_EVENT_LABELS,
  createExport,
  getActivity,
  getExportDownloadUrl,
  listExports,
  updateSelf,
  type ActivityPage,
  type DataExport,
} from "./account";

const exampleEvent = {
  event_id: "e1",
  event_type: "site.created",
  occurred_at: "2026-01-01T00:00:00.000Z",
  resource_type: "site" as const,
  resource_id: "s1",
  outcome: "success" as const,
};

const exampleExport: DataExport = {
  export_id: "1700000000000-abcdef12",
  status: "ready",
  created_at: "2026-01-01T00:00:00.000Z",
  size_bytes: 1024,
};

describe("account API client", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.put).mockReset();
    vi.mocked(api.del).mockReset();
  });

  it("getActivity forwards limit/cursor as query params", async () => {
    const page: ActivityPage = { events: [exampleEvent], next_cursor: "abc" };
    vi.mocked(api.get).mockResolvedValueOnce(page);

    const result = await getActivity({ limit: 50, cursor: "xyz" });

    expect(api.get).toHaveBeenCalledWith("/v1/user/self/activity", { limit: 50, cursor: "xyz" });
    expect(result).toEqual(page);
  });

  it("getActivity works with no params", async () => {
    const page: ActivityPage = { events: [], next_cursor: null };
    vi.mocked(api.get).mockResolvedValueOnce(page);

    await getActivity();

    expect(api.get).toHaveBeenCalledWith("/v1/user/self/activity", undefined);
  });

  it("createExport POSTs to /v1/user/self/exports and returns the export", async () => {
    vi.mocked(api.post).mockResolvedValueOnce(exampleExport);

    const result = await createExport();

    expect(api.post).toHaveBeenCalledWith("/v1/user/self/exports");
    expect(result).toEqual(exampleExport);
  });

  it("listExports unwraps the {exports: [...]} envelope into a bare array", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ exports: [exampleExport] });

    const result = await listExports();

    expect(api.get).toHaveBeenCalledWith("/v1/user/self/exports");
    expect(result).toEqual([exampleExport]);
  });

  it("getExportDownloadUrl GETs the download endpoint for the given id", async () => {
    const download = { url: "https://s3.example.com/signed", expires_at: "2026-01-01T00:05:00.000Z", filename: "x.json" };
    vi.mocked(api.get).mockResolvedValueOnce(download);

    const result = await getExportDownloadUrl(exampleExport.export_id);

    expect(api.get).toHaveBeenCalledWith(`/v1/user/self/exports/${exampleExport.export_id}/download`);
    expect(result).toEqual(download);
  });

  it("updateSelf PUTs to /v1/user/self and returns the updated user", async () => {
    const updated = {
      email: "jane@example.com",
      user_id: "u1",
      first_name: "Janet",
      last_name: "Doe",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    vi.mocked(api.put).mockResolvedValueOnce(updated);

    const result = await updateSelf({ first_name: "Janet" });

    expect(api.put).toHaveBeenCalledWith("/v1/user/self", { first_name: "Janet" });
    expect(result).toEqual(updated);
  });

  it("ACTIVITY_EVENT_LABELS has a human label for every known event type", () => {
    expect(ACTIVITY_EVENT_LABELS["site.created"]).toBe("Site created");
    expect(ACTIVITY_EVENT_LABELS["auth.login.succeeded"]).toBe("Logged in");
    expect(ACTIVITY_EVENT_LABELS["auth.login.failed"]).toBe("Failed login");
  });
});
