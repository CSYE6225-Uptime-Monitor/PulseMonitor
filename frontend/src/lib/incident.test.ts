import { describe, it, expect } from "vitest";
import { buildIncidentBody, getIncidentTitle } from "./incident";

describe("getIncidentTitle", () => {
  it("maps known error types to a human title", () => {
    expect(getIncidentTitle("timeout")).toBe("Request timed out");
    expect(getIncidentTitle("dns_error")).toBe("DNS lookup failed");
    expect(getIncidentTitle("connection_refused")).toBe("Connection refused");
    expect(getIncidentTitle("tls_error")).toBe("TLS handshake failed");
  });

  it("falls back to a generic title for an unrecognized or null error type", () => {
    expect(getIncidentTitle("something_new")).toBe("Site unreachable");
    expect(getIncidentTitle(null)).toBe("Site unreachable");
  });
});

describe("buildIncidentBody", () => {
  it("includes the failing-since sentence when last_status_change_at is present", () => {
    const body = buildIncidentBody({
      error_type: "timeout",
      error_message: null,
      consecutive_failures: 3,
      last_status_change_at: "2026-01-01T00:00:00.000Z",
    });
    expect(body).toContain("Checks have been failing since");
  });

  it("omits the failing-since sentence when last_status_change_at is null", () => {
    const body = buildIncidentBody({
      error_type: "timeout",
      error_message: null,
      consecutive_failures: 1,
      last_status_change_at: null,
    });
    expect(body).not.toContain("Checks have been failing since");
  });

  it("uses singular phrasing for exactly one consecutive failure", () => {
    const body = buildIncidentBody({
      error_type: "timeout",
      error_message: null,
      consecutive_failures: 1,
      last_status_change_at: null,
    });
    expect(body).toContain("1 check has failed.");
  });

  it("uses plural phrasing for multiple consecutive failures", () => {
    const body = buildIncidentBody({
      error_type: "timeout",
      error_message: null,
      consecutive_failures: 4,
      last_status_change_at: null,
    });
    expect(body).toContain("4 consecutive checks have failed.");
  });

  it("prefers the server's error_message over the generic fallback", () => {
    const body = buildIncidentBody({
      error_type: "timeout",
      error_message: "Custom server message.",
      consecutive_failures: 1,
      last_status_change_at: null,
    });
    expect(body).toContain("Custom server message.");
  });

  it("falls back to a per-error-type sentence when error_message is null", () => {
    const body = buildIncidentBody({
      error_type: "dns_error",
      error_message: null,
      consecutive_failures: 1,
      last_status_change_at: null,
    });
    expect(body).toContain("hostname could not be resolved");
  });

  it("falls back to a generic sentence for an unrecognized error type with no message", () => {
    const body = buildIncidentBody({
      error_type: null,
      error_message: null,
      consecutive_failures: 1,
      last_status_change_at: null,
    });
    expect(body).toContain("couldn't complete a successful check");
  });
});
