import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportList } from "./ExportList";
import type { DataExport } from "@/lib/account";

const readyExport: DataExport = {
  export_id: "1700000000000-abcdef12",
  status: "ready",
  created_at: "2026-01-01T00:00:00.000Z",
  size_bytes: 1024,
};

describe("ExportList", () => {
  it("shows a loading state and no table while loading", () => {
    render(<ExportList exports={[]} loading error={null} onDownload={vi.fn()} downloadingId={null} />);

    expect(screen.getByText(/loading exports/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows an error message and no table when loading failed", () => {
    render(<ExportList exports={[]} loading={false} error="Failed to load exports." onDownload={vi.fn()} downloadingId={null} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load exports.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no exports", () => {
    render(<ExportList exports={[]} loading={false} error={null} onDownload={vi.fn()} downloadingId={null} />);

    expect(screen.getByText(/no exports yet/i)).toBeInTheDocument();
  });

  it("renders a row per export with an enabled Download button for a ready export", async () => {
    const user = userEvent.setup();
    const onDownload = vi.fn();
    render(<ExportList exports={[readyExport]} loading={false} error={null} onDownload={onDownload} downloadingId={null} />);

    const button = screen.getByRole("button", { name: "Download" });
    expect(button).toBeEnabled();

    await user.click(button);
    expect(onDownload).toHaveBeenCalledWith(readyExport.export_id);
  });

  it("shows Preparing... and disables the button for the export currently downloading", () => {
    render(
      <ExportList
        exports={[readyExport]}
        loading={false}
        error={null}
        onDownload={vi.fn()}
        downloadingId={readyExport.export_id}
      />
    );

    expect(screen.getByRole("button", { name: "Preparing..." })).toBeDisabled();
  });

  it("does not disable other rows while a different export is downloading", () => {
    const otherExport: DataExport = { ...readyExport, export_id: "1700000000001-bbbbbbbb" };
    render(
      <ExportList
        exports={[readyExport, otherExport]}
        loading={false}
        error={null}
        onDownload={vi.fn()}
        downloadingId={otherExport.export_id}
      />
    );

    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Preparing..." })).toBeDisabled();
  });
});
