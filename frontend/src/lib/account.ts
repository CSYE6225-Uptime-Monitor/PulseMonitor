import { api, type QueryParams, type User } from "./api";

export type ActivityOutcome = "success" | "failure";

export interface ActivityEvent {
  event_id: string;
  event_type: string;
  occurred_at: string;
  resource_type: string | null;
  resource_id: string | null;
  outcome: ActivityOutcome;
}

export interface ActivityPage {
  events: ActivityEvent[];
  next_cursor: string | null;
}

export interface GetActivityParams extends QueryParams {
  limit?: number;
  cursor?: string;
}

// The backend writes exports synchronously (backend/src/services/exportService.js)
// - there is no worker, so "ready" is the only status that has ever existed.
// Kept as a type (not a bare string) so a future async status is a type
// error at every call site that assumes "ready", not a silent runtime bug.
export type ExportStatus = "ready";

export interface DataExport {
  export_id: string;
  status: ExportStatus;
  created_at: string;
  size_bytes: number;
}

export interface ExportDownload {
  url: string;
  expires_at: string;
  filename: string;
}

// Falls back to the raw event_type when a key is missing, so a backend event
// type added later renders as-is instead of blank.
export const ACTIVITY_EVENT_LABELS: Record<string, string> = {
  "auth.login.succeeded": "Logged in",
  "auth.login.failed": "Failed login",
  "auth.logout": "Logged out",
  "user.created": "Account created",
  "user.updated": "Profile updated",
  "user.export.requested": "Data export requested",
  "user.export.downloaded": "Data export downloaded",
  "site.created": "Site created",
  "site.updated": "Site updated",
  "site.deleted": "Site deleted",
};

export function getActivity(params?: GetActivityParams): Promise<ActivityPage> {
  return api.get<ActivityPage>("/v1/user/self/activity", params);
}

export function createExport(): Promise<DataExport> {
  return api.post<DataExport>("/v1/user/self/exports");
}

export async function listExports(): Promise<DataExport[]> {
  const { exports: items } = await api.get<{ exports: DataExport[] }>("/v1/user/self/exports");
  return items;
}

export function getExportDownloadUrl(exportId: string): Promise<ExportDownload> {
  return api.get<ExportDownload>(`/v1/user/self/exports/${exportId}/download`);
}

export function updateSelf(input: Partial<Pick<User, "first_name" | "last_name">>): Promise<User> {
  return api.put<User>("/v1/user/self", input);
}
