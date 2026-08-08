import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityTable } from "./ActivityTable";
import type { ActivityEvent } from "@/lib/account";

const siteCreatedEvent: ActivityEvent = {
  event_id: "e1",
  event_type: "site.created",
  occurred_at: "2026-01-01T00:05:00.000Z",
  resource_type: "site",
  resource_id: "s1",
  outcome: "success",
};

const loginFailedEvent: ActivityEvent = {
  event_id: "e2",
  event_type: "auth.login.failed",
  occurred_at: "2026-01-01T00:10:00.000Z",
  resource_type: null,
  resource_id: null,
  outcome: "failure",
};

describe("ActivityTable", () => {
  it("shows an empty state when there are no events", () => {
    render(<ActivityTable events={[]} nextCursor={null} onLoadMore={vi.fn()} />);

    expect(screen.getByText(/no account activity yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders a row per event with a human label, resource, and outcome", () => {
    render(<ActivityTable events={[siteCreatedEvent, loginFailedEvent]} nextCursor={null} onLoadMore={vi.fn()} />);

    expect(screen.getByText("Site created")).toBeInTheDocument();
    expect(screen.getByText("Failed login")).toBeInTheDocument();
    expect(screen.getByText("Success")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("renders an em dash for a null resource", () => {
    render(<ActivityTable events={[loginFailedEvent]} nextCursor={null} onLoadMore={vi.fn()} />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("falls back to the raw event_type for an unrecognized event", () => {
    const unknownEvent: ActivityEvent = { ...siteCreatedEvent, event_type: "future.event.type" };
    render(<ActivityTable events={[unknownEvent]} nextCursor={null} onLoadMore={vi.fn()} />);

    expect(screen.getByText("future.event.type")).toBeInTheDocument();
  });

  it("shows a Load more button when a next_cursor is present", () => {
    render(<ActivityTable events={[siteCreatedEvent]} nextCursor="opaque-cursor" onLoadMore={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
  });

  it("hides the Load more button once next_cursor is null", () => {
    render(<ActivityTable events={[siteCreatedEvent]} nextCursor={null} onLoadMore={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("calls onLoadMore when Load more is clicked", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    render(<ActivityTable events={[siteCreatedEvent]} nextCursor="opaque-cursor" onLoadMore={onLoadMore} />);

    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("disables the Load more button while a page is already loading", () => {
    render(<ActivityTable events={[siteCreatedEvent]} nextCursor="opaque-cursor" onLoadMore={vi.fn()} loadingMore />);

    expect(screen.getByRole("button", { name: "Loading..." })).toBeDisabled();
  });
});
