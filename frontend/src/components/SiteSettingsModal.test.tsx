import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SiteSettingsModal } from "./SiteSettingsModal";
import type { Site } from "@/lib/sites";

// jsdom doesn't implement showModal/close on <dialog>
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

const site: Site = {
  site_id: "s1",
  url: "https://example.com",
  name: "Example",
  check_frequency_minutes: 5,
  enabled: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  status: {
    status: "up",
    status_code: 200,
    latency_ms: 120,
    checked_at: "2026-01-01T00:01:00Z",
    error_type: null,
    error_message: null,
    consecutive_failures: 0,
    last_status_change_at: null,
  },
};

describe("SiteSettingsModal", () => {
  it("renders a gear button with an accessible label", () => {
    render(<SiteSettingsModal site={site} onUpdate={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByRole("button", { name: /site settings/i })).toBeInTheDocument();
  });

  it("modal is closed on initial render", () => {
    render(<SiteSettingsModal site={site} onUpdate={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.queryByRole("textbox", { name: /url/i })).not.toBeInTheDocument();
  });

  it("clicking the gear button opens the modal", async () => {
    const user = userEvent.setup();
    render(<SiteSettingsModal site={site} onUpdate={vi.fn()} onDelete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /site settings/i }));

    expect(screen.getByRole("textbox", { name: /url/i })).toBeInTheDocument();
  });

  it("pre-fills the form with current site values", async () => {
    const user = userEvent.setup();
    render(<SiteSettingsModal site={site} onUpdate={vi.fn()} onDelete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /site settings/i }));

    expect(screen.getByRole("textbox", { name: /url/i })).toHaveValue("https://example.com");
    expect(screen.getByRole("textbox", { name: /name/i })).toHaveValue("Example");
  });

  it("calls onUpdate with changed values and closes the modal", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(<SiteSettingsModal site={site} onUpdate={onUpdate} onDelete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /site settings/i }));
    const nameInput = screen.getByRole("textbox", { name: /name/i });
    await user.clear(nameInput);
    await user.type(nameInput, "Updated Name");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Updated Name" })
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: /url/i })).not.toBeInTheDocument();
    });
  });

  it("shows an error message when onUpdate rejects", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockRejectedValue(new Error("Server error"));
    render(<SiteSettingsModal site={site} onUpdate={onUpdate} onDelete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /site settings/i }));
    // Must dirty a field so the form's canSubmit guard allows submission
    const nameInput = screen.getByRole("textbox", { name: /name/i });
    await user.clear(nameInput);
    await user.type(nameInput, "Changed");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText(/server error/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("textbox", { name: /url/i })).toBeInTheDocument();
  });

  it("clicking Close dismisses the modal without calling onUpdate", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<SiteSettingsModal site={site} onUpdate={onUpdate} onDelete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /site settings/i }));
    await user.click(screen.getByRole("button", { name: /close/i }));

    expect(screen.queryByRole("textbox", { name: /url/i })).not.toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("clicking Delete site shows a confirmation step", async () => {
    const user = userEvent.setup();
    render(<SiteSettingsModal site={site} onUpdate={vi.fn()} onDelete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /site settings/i }));
    await user.click(screen.getByRole("button", { name: /delete site/i }));

    expect(screen.getByRole("button", { name: /confirm deletion/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("cancelling the confirm step returns to the Delete site button", async () => {
    const user = userEvent.setup();
    render(<SiteSettingsModal site={site} onUpdate={vi.fn()} onDelete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /site settings/i }));
    await user.click(screen.getByRole("button", { name: /delete site/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByRole("button", { name: /delete site/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirm deletion/i })).not.toBeInTheDocument();
  });

  it("confirming deletion calls onDelete", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<SiteSettingsModal site={site} onUpdate={vi.fn()} onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: /site settings/i }));
    await user.click(screen.getByRole("button", { name: /delete site/i }));
    await user.click(screen.getByRole("button", { name: /confirm deletion/i }));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledOnce();
    });
  });
});
