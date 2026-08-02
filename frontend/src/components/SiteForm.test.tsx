import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SiteForm, type SiteFormValues } from "./SiteForm";
import { ApiError } from "@/lib/api";

const initialValues: SiteFormValues = {
  url: "https://example.com",
  name: "Example",
  check_frequency_minutes: 10,
  enabled: true,
};

describe("SiteForm", () => {
  describe("create mode", () => {
    it("renders empty fields with the pinger's default check frequency and enabled=true", () => {
      render(<SiteForm mode="create" onSubmit={vi.fn()} />);

      expect(screen.getByLabelText("URL")).toHaveValue("");
      expect(screen.getByLabelText("Name")).toHaveValue("");
      expect(screen.getByLabelText("Check frequency (minutes)")).toHaveValue("5");
      expect(screen.getByLabelText("Enabled")).toBeChecked();
    });

    it("submits the full form as a CreateSiteInput", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(<SiteForm mode="create" onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText("URL"), "https://example.com");
      await user.type(screen.getByLabelText("Name"), "Example");
      await user.click(screen.getByRole("button", { name: "Add site" }));

      expect(onSubmit).toHaveBeenCalledWith({
        url: "https://example.com",
        name: "Example",
        check_frequency_minutes: 5,
        enabled: true,
      });
    });

    it("shows the server's validation message inline when the create request is rejected", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockRejectedValue(new ApiError(400, "URL rejected: private IPs are not allowed"));
      render(<SiteForm mode="create" onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText("URL"), "http://127.0.0.1");
      await user.type(screen.getByLabelText("Name"), "Local");
      await user.click(screen.getByRole("button", { name: "Add site" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("URL rejected: private IPs are not allowed");
    });
  });

  describe("edit mode", () => {
    it("pre-fills fields from initialValues", () => {
      render(<SiteForm mode="edit" initialValues={initialValues} onSubmit={vi.fn()} />);

      expect(screen.getByLabelText("URL")).toHaveValue("https://example.com");
      expect(screen.getByLabelText("Name")).toHaveValue("Example");
      expect(screen.getByLabelText("Check frequency (minutes)")).toHaveValue("10");
      expect(screen.getByLabelText("Enabled")).toBeChecked();
    });

    it("disables the submit button until a field actually changes", () => {
      render(<SiteForm mode="edit" initialValues={initialValues} onSubmit={vi.fn()} />);

      expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    });

    it("sends only the changed field, since the update schema is strict about unknown keys", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(<SiteForm mode="edit" initialValues={initialValues} onSubmit={onSubmit} />);

      await user.clear(screen.getByLabelText("Name"));
      await user.type(screen.getByLabelText("Name"), "Renamed");
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      expect(onSubmit).toHaveBeenCalledWith({ name: "Renamed" });
    });

    it("disables the submit button again after the changed field is reverted back to its original value", async () => {
      const user = userEvent.setup();
      render(<SiteForm mode="edit" initialValues={initialValues} onSubmit={vi.fn()} />);

      await user.clear(screen.getByLabelText("Name"));
      await user.type(screen.getByLabelText("Name"), "Renamed");
      expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();

      await user.clear(screen.getByLabelText("Name"));
      await user.type(screen.getByLabelText("Name"), "Example");
      expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    });
  });

  it("disables the submit button while the request is in flight", async () => {
    const user = userEvent.setup();
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        })
    );
    render(<SiteForm mode="create" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("URL"), "https://example.com");
    await user.type(screen.getByLabelText("Name"), "Example");
    await user.click(screen.getByRole("button", { name: "Add site" }));

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();

    resolveSubmit();
    expect(await screen.findByRole("button", { name: "Add site" })).toBeEnabled();
  });
});
