import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { Landing } from "@/components/Landing";

describe("Landing component", () => {
  it("renders a header landmark", () => {
    render(<Landing />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("renders the PulseMonitor wordmark in the navbar", () => {
    render(<Landing />);
    const header = screen.getByRole("banner");
    expect(header).toHaveTextContent("PulseMonitor");
  });

  it("renders a Log in link in the navbar pointing to /login", () => {
    render(<Landing />);
    const header = screen.getByRole("banner");
    const link = header.querySelector("a[href='/login']");
    expect(link).toBeInTheDocument();
    expect(link).toHaveTextContent(/log in/i);
  });

  it("renders a Start monitoring link in the navbar pointing to /signup", () => {
    render(<Landing />);
    const links = screen.getAllByRole("link", { name: /start monitoring/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute("href", "/signup");
  });

  it("renders a footer landmark", () => {
    render(<Landing />);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("renders the copyright notice in the footer", () => {
    render(<Landing />);
    expect(screen.getByText(/2026 PulseMonitor/i)).toBeInTheDocument();
  });

  it("renders Log in and Sign up links in the footer", () => {
    render(<Landing />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent(/log in/i);
    expect(footer).toHaveTextContent(/sign up/i);
  });
});
