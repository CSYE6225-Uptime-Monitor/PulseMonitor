import { api, type QueryParams } from "./api";

export type SiteStatusValue = "up" | "down" | "unknown";

export interface SiteStatus {
  status: SiteStatusValue;
  status_code: number | null;
  latency_ms: number | null;
  checked_at: string | null;
  error_type: string | null;
  error_message: string | null;
  consecutive_failures: number;
  last_status_change_at: string | null;
}

export interface Site {
  site_id: string;
  url: string;
  name: string;
  check_frequency_minutes: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  status: SiteStatus;
}

export interface HistoryRecord {
  check_id: string;
  site_id: string;
  url: string;
  checked_at: string;
  status: "up" | "down";
  status_code: number | null;
  latency_ms: number | null;
  error_type: string | null;
  error_message: string | null;
  region: string | null;
}

export interface HistoryPage {
  records: HistoryRecord[];
  next_cursor: string | null;
}

// Floor of 5 matches the pinger's EventBridge tick (var.ping_schedule); the
// API rejects any value outside this set (backend/src/schemas/siteSchemas.js).
export const ALLOWED_FREQUENCIES = [5, 10, 15, 30, 60, 120, 360, 720, 1440] as const;

export interface CreateSiteInput {
  url: string;
  name: string;
  check_frequency_minutes?: number;
  enabled?: boolean;
}

export type UpdateSiteInput = Partial<CreateSiteInput>;

export interface GetHistoryParams extends QueryParams {
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export async function listSites(): Promise<Site[]> {
  const { sites } = await api.get<{ sites: Site[] }>("/v1/sites");
  return sites;
}

export function createSite(input: CreateSiteInput): Promise<Site> {
  return api.post<Site>("/v1/sites", input);
}

export function getSite(siteId: string): Promise<Site> {
  return api.get<Site>(`/v1/sites/${siteId}`);
}

export function updateSite(siteId: string, input: UpdateSiteInput): Promise<Site> {
  return api.put<Site>(`/v1/sites/${siteId}`, input);
}

export function deleteSite(siteId: string): Promise<void> {
  return api.del<void>(`/v1/sites/${siteId}`);
}

export function getSiteStatus(siteId: string): Promise<{ site_id: string } & SiteStatus> {
  return api.get(`/v1/sites/${siteId}/status`);
}

export function getSiteHistory(siteId: string, params?: GetHistoryParams): Promise<HistoryPage> {
  return api.get<HistoryPage>(`/v1/sites/${siteId}/history`, params);
}
