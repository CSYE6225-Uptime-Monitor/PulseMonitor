import { describe, it, expect, vi } from "vitest";
import { startDownload } from "./download";

describe("startDownload", () => {
  it("navigates to the given url via window.location.assign", () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });

    startDownload("https://s3.example.com/signed?X-Amz-Signature=abc");

    expect(assign).toHaveBeenCalledWith("https://s3.example.com/signed?X-Amz-Signature=abc");
    vi.unstubAllGlobals();
  });
});
