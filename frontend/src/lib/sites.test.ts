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
  ALLOWED_FREQUENCIES,
  createSite,
  deleteSite,
  getSite,
  getSiteHistory,
  getSiteStatus,
  listSites,
  updateSite,
  type Site,
} from "./sites";

const exampleStatus = {
  status: "unknown" as const,
  status_code: null,
  latency_ms: null,
  checked_at: null,
  error_type: null,
  error_message: null,
  consecutive_failures: 0,
  last_status_change_at: null,
};

const exampleSite: Site = {
  site_id: "11111111-1111-1111-1111-111111111111",
  url: "https://example.com",
  name: "Example",
  check_frequency_minutes: 5,
  enabled: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  status: exampleStatus,
};

describe("sites API client", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.put).mockReset();
    vi.mocked(api.del).mockReset();
  });

  it("exposes the pinger's allowed check-frequency values in minutes", () => {
    expect(ALLOWED_FREQUENCIES).toEqual([5, 10, 15, 30, 60, 120, 360, 720, 1440]);
  });

  it("listSites unwraps the {sites: [...]} envelope into a bare array", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ sites: [exampleSite] });

    const result = await listSites();

    expect(api.get).toHaveBeenCalledWith("/v1/sites");
    expect(result).toEqual([exampleSite]);
  });

  it("createSite posts to /v1/sites and returns the created site", async () => {
    vi.mocked(api.post).mockResolvedValueOnce(exampleSite);

    const result = await createSite({ url: "https://example.com", name: "Example" });

    expect(api.post).toHaveBeenCalledWith("/v1/sites", { url: "https://example.com", name: "Example" });
    expect(result).toEqual(exampleSite);
  });

  it("getSite fetches a single site by id", async () => {
    vi.mocked(api.get).mockResolvedValueOnce(exampleSite);

    const result = await getSite(exampleSite.site_id);

    expect(api.get).toHaveBeenCalledWith(`/v1/sites/${exampleSite.site_id}`);
    expect(result).toEqual(exampleSite);
  });

  it("updateSite PUTs only the fields it is given, unmodified", async () => {
    vi.mocked(api.put).mockResolvedValueOnce({ ...exampleSite, name: "Renamed" });

    const result = await updateSite(exampleSite.site_id, { name: "Renamed" });

    expect(api.put).toHaveBeenCalledWith(`/v1/sites/${exampleSite.site_id}`, { name: "Renamed" });
    expect(result.name).toBe("Renamed");
  });

  it("deleteSite DELETEs the site and returns nothing", async () => {
    vi.mocked(api.del).mockResolvedValueOnce(undefined);

    const result = await deleteSite(exampleSite.site_id);

    expect(api.del).toHaveBeenCalledWith(`/v1/sites/${exampleSite.site_id}`);
    expect(result).toBeUndefined();
  });

  it("getSiteStatus returns the flattened {site_id, ...status} shape as-is", async () => {
    const flattened = { site_id: exampleSite.site_id, ...exampleStatus };
    vi.mocked(api.get).mockResolvedValueOnce(flattened);

    const result = await getSiteStatus(exampleSite.site_id);

    expect(api.get).toHaveBeenCalledWith(`/v1/sites/${exampleSite.site_id}/status`);
    expect(result).toEqual(flattened);
  });

  it("getSiteHistory forwards from/to/limit/cursor as query params", async () => {
    const page = { records: [], next_cursor: null };
    vi.mocked(api.get).mockResolvedValueOnce(page);

    const result = await getSiteHistory(exampleSite.site_id, { limit: 25, cursor: "abc" });

    expect(api.get).toHaveBeenCalledWith(`/v1/sites/${exampleSite.site_id}/history`, {
      limit: 25,
      cursor: "abc",
    });
    expect(result).toEqual(page);
  });

  it("getSiteHistory works with no params for the default 24h window", async () => {
    const page = { records: [], next_cursor: null };
    vi.mocked(api.get).mockResolvedValueOnce(page);

    await getSiteHistory(exampleSite.site_id);

    expect(api.get).toHaveBeenCalledWith(`/v1/sites/${exampleSite.site_id}/history`, undefined);
  });
});
