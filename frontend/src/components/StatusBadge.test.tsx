import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders 'Up' for an up status", () => {
    render(<StatusBadge status="up" />);
    expect(screen.getByText("Up")).toBeInTheDocument();
  });

  it("renders 'Down' for a down status", () => {
    render(<StatusBadge status="down" />);
    expect(screen.getByText("Down")).toBeInTheDocument();
  });

  it("renders 'Unknown' for a site that has never been checked", () => {
    render(<StatusBadge status="unknown" />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("exposes the raw status value as a data attribute for styling/testing hooks", () => {
    render(<StatusBadge status="down" />);
    expect(screen.getByText("Down")).toHaveAttribute("data-status", "down");
  });
});
