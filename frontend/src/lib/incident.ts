import type { SiteStatus } from "./sites";

const INCIDENT_TITLES: Record<string, string> = {
  timeout: "Request timed out",
  dns_error: "DNS lookup failed",
  connection_refused: "Connection refused",
  tls_error: "TLS handshake failed",
  http_error: "Error response from the server",
};

const INCIDENT_FALLBACKS: Record<string, string> = {
  timeout: "The server did not respond before the request timed out.",
  dns_error: "The hostname could not be resolved. Check the domain's DNS records.",
  connection_refused: "The server actively refused the connection. It may be down or blocking this region.",
  tls_error: "The TLS certificate could not be validated.",
  http_error: "The server responded with an error status.",
};

export function getIncidentTitle(errorType: string | null): string {
  if (errorType && INCIDENT_TITLES[errorType]) return INCIDENT_TITLES[errorType];
  return "Site unreachable";
}

export type IncidentStatus = Pick<
  SiteStatus,
  "error_type" | "error_message" | "consecutive_failures" | "last_status_change_at"
>;

export function buildIncidentBody(status: IncidentStatus): string {
  const sentences: string[] = [];

  if (status.last_status_change_at) {
    sentences.push(`Checks have been failing since ${new Date(status.last_status_change_at).toLocaleString()}.`);
  }

  if (status.consecutive_failures > 0) {
    sentences.push(
      status.consecutive_failures === 1
        ? "1 check has failed."
        : `${status.consecutive_failures} consecutive checks have failed.`
    );
  }

  sentences.push(
    status.error_message ??
      (status.error_type ? INCIDENT_FALLBACKS[status.error_type] : undefined) ??
      "PulseMonitor couldn't complete a successful check."
  );

  return sentences.join(" ");
}
