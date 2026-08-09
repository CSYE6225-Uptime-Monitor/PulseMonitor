import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SiteList } from "./SiteList";
import type { Site } from "@/lib/sites";

const upSite: Site = {
  site_id: "11111111-1111-1111-1111-111111111111",
  url: "https://example.com",
  name: "Example",
  check_frequency_minutes: 5,
  enabled: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  status: {
    status: "up",
    status_code: 200,
    latency_ms: 120,
    checked_at: "2026-01-01T00:05:00.000Z",
    error_type: null,
    error_message: null,
    consecutive_failures: 0,
    last_status_change_at: "2026-01-01T00:05:00.000Z",
  },
};

const unknownSite: Site = {
  ...upSite,
  site_id: "22222222-2222-2222-2222-222222222222",
  name: "Fresh Site",
  status: {
    status: "unknown",
    status_code: null,
    latency_ms: null,
    checked_at: null,
    error_type: null,
    error_message: null,
    consecutive_failures: 0,
    last_status_change_at: null,
  },
};

describe("SiteList", () => {
  it("shows a loading state and no list while loading", () => {
    render(<SiteList sites={[]} loading error={null} />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows an error message and no list when loading failed", () => {
    render(<SiteList sites={[]} loading={false} error="Failed to load sites." />);

    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load sites.");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no sites", () => {
    render(<SiteList sites={[]} loading={false} error={null} />);

    expect(screen.getByText(/no sites yet/i)).toBeInTheDocument();
  });

  it("renders a row per site with a link to its detail page and its status", () => {
    render(<SiteList sites={[upSite]} loading={false} error={null} />);

    const link = screen.getByRole("link", { name: "Example" });
    expect(link).toHaveAttribute("href", `/sites/${upSite.site_id}`);
    expect(screen.getByText("Up")).toBeInTheDocument();
    expect(screen.getByText("120 ms")).toBeInTheDocument();
  });

  it("renders a placeholder for sites that have never been checked", () => {
    render(<SiteList sites={[unknownSite]} loading={false} error={null} />);

    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText(/never checked/i)).toBeInTheDocument();
  });

  it("keeps showing the last known list alongside the error when a later poll fails", () => {
    render(<SiteList sites={[upSite]} loading={false} error="Failed to load sites." />);

    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load sites.");
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Example" })).toBeInTheDocument();
  });
});
