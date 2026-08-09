import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HistoryTable } from "./HistoryTable";
import type { HistoryRecord } from "@/lib/sites";

const upRecord: HistoryRecord = {
  check_id: "abc123",
  site_id: "11111111-1111-1111-1111-111111111111",
  url: "https://example.com",
  checked_at: "2026-01-01T00:05:00.000Z",
  status: "up",
  status_code: 200,
  latency_ms: 118,
  error_type: null,
  error_message: null,
  region: "us-east-1",
};

const downRecord: HistoryRecord = {
  ...upRecord,
  check_id: "def456",
  checked_at: "2026-01-01T00:10:00.000Z",
  status: "down",
  status_code: null,
  latency_ms: null,
  error_type: "timeout",
  error_message: "Request timed out after 10000ms",
};

describe("HistoryTable", () => {
  it("shows an empty state when there are no records", () => {
    render(<HistoryTable records={[]} nextCursor={null} onLoadMore={vi.fn()} />);

    expect(screen.getByText(/no history yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders a row per history record, including error details for failed checks", () => {
    render(<HistoryTable records={[upRecord, downRecord]} nextCursor={null} onLoadMore={vi.fn()} />);

    expect(screen.getByText("Up")).toBeInTheDocument();
    expect(screen.getByText("118 ms")).toBeInTheDocument();
    expect(screen.getByText("Down")).toBeInTheDocument();
    expect(screen.getByText("Request timed out after 10000ms")).toBeInTheDocument();
  });

  it("shows a Load more button when a next_cursor is present", () => {
    render(<HistoryTable records={[upRecord]} nextCursor="opaque-cursor" onLoadMore={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
  });

  it("hides the Load more button once next_cursor is null", () => {
    render(<HistoryTable records={[upRecord]} nextCursor={null} onLoadMore={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("calls onLoadMore when Load more is clicked", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    render(<HistoryTable records={[upRecord]} nextCursor="opaque-cursor" onLoadMore={onLoadMore} />);

    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("disables the Load more button while a page is already loading", () => {
    render(<HistoryTable records={[upRecord]} nextCursor="opaque-cursor" onLoadMore={vi.fn()} loadingMore />);

    expect(screen.getByRole("button", { name: "Loading…" })).toBeDisabled();
  });
});
