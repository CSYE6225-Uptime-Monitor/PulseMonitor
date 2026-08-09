import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { UptimeBar, UptimeBarSkeleton } from "./UptimeBar";
import type { UptimeBucket } from "@/lib/uptime";

function bucket(state: UptimeBucket["state"], key: string): UptimeBucket {
  return {
    key,
    state,
    label: key,
    startMs: 0,
    endMs: 0,
    checks: state === "empty" ? 0 : 1,
    downChecks: state === "down" ? 1 : 0,
    carried: false,
    tooltip: `${key} tooltip`,
  };
}

describe("UptimeBar", () => {
  it("renders one bar per bucket", () => {
    const buckets = [bucket("up", "a"), bucket("down", "b"), bucket("partial", "c"), bucket("empty", "d")];
    render(<UptimeBar buckets={buckets} axisLabels={["09:00", "10:00"]} summary="Uptime chart summary" />);
    // role="img" wrapper + 4 bar children
    const strip = screen.getByRole("img", { name: "Uptime chart summary" });
    expect(strip.children).toHaveLength(4);
  });

  it("applies the correct color class per bucket state", () => {
    const buckets = [bucket("up", "a"), bucket("down", "b"), bucket("partial", "c"), bucket("empty", "d")];
    render(<UptimeBar buckets={buckets} axisLabels={["09:00"]} summary="Uptime chart summary" />);
    const strip = screen.getByRole("img", { name: "Uptime chart summary" });
    const bars = Array.from(strip.children).map((wrapper) => wrapper.firstElementChild as HTMLElement);
    expect(bars[0].className).toContain("bg-up-bar");
    expect(bars[1].className).toContain("bg-down-bar");
    expect(bars[2].className).toContain("bg-partial-bar");
    expect(bars[3].className).toContain("bg-empty-bar");
  });

  it("carries the summary sentence as the aria-label on the visualization", () => {
    const buckets = [bucket("up", "a")];
    render(<UptimeBar buckets={buckets} axisLabels={["09:00"]} summary="97% of checks succeeded" />);
    expect(screen.getByRole("img", { name: "97% of checks succeeded" })).toBeInTheDocument();
  });

  it("hides odd-indexed axis labels below the sm breakpoint", () => {
    render(<UptimeBar buckets={[bucket("up", "a")]} axisLabels={["09:00", "10:00", "11:00"]} summary="s" />);
    const labels = screen.getAllByText(/\d\d:00/);
    expect(labels[0].className).not.toContain("hidden");
    expect(labels[1].className).toContain("hidden");
    expect(labels[2].className).not.toContain("hidden");
  });

  it("desaturates the strip when muted", () => {
    render(<UptimeBar buckets={[bucket("up", "a")]} axisLabels={["09:00"]} summary="s" muted />);
    const strip = screen.getByRole("img", { name: "s" });
    expect(strip.className).toContain("grayscale");
  });

  it("renders outage details as a visually-hidden list for screen readers", () => {
    render(
      <UptimeBar
        buckets={[bucket("down", "a")]}
        axisLabels={["09:00"]}
        summary="s"
        details={["Outage from 09:00 to 09:30."]}
      />
    );
    expect(screen.getByText("Outage from 09:00 to 09:30.")).toBeInTheDocument();
  });
});

describe("UptimeBarSkeleton", () => {
  it("renders as decorative (aria-hidden) with no accessible content", () => {
    const { container } = render(<UptimeBarSkeleton />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
