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

  it("renders the hero headline", () => {
    render(<Landing />);
    expect(
      screen.getByRole("heading", { level: 1, name: /know the moment your site goes down/i })
    ).toBeInTheDocument();
  });

  it("renders the hero primary CTA linking to /signup", () => {
    render(<Landing />);
    const link = screen.getByRole("link", { name: /start monitoring.*it.*free/i });
    expect(link).toHaveAttribute("href", "/signup");
  });

  it("renders the hero secondary Log in link pointing to /login", () => {
    render(<Landing />);
    const links = screen.getAllByRole("link", { name: /^log in$/i });
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/login");
  });

  it("renders the demo site name in the hero product card", () => {
    render(<Landing />);
    const hero = document.querySelector('[data-section="hero"]')!;
    expect(hero).toHaveTextContent("my-store.com");
  });

  it("renders an 'Up' status badge in the hero product card", () => {
    render(<Landing />);
    const hero = document.querySelector('[data-section="hero"]')!;
    expect(hero).toHaveTextContent("Up");
  });

  it("renders the 'How It Works' section with three step titles", () => {
    render(<Landing />);
    expect(screen.getByText("Add your site")).toBeInTheDocument();
    expect(screen.getByText("We check it every minute")).toBeInTheDocument();
    expect(screen.getByText("Get alerted instantly")).toBeInTheDocument();
  });

  it("renders the three step numbers 1, 2, 3", () => {
    render(<Landing />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders all four feature headings", () => {
    render(<Landing />);
    expect(screen.getByRole("heading", { name: /minute-by-minute checks/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /email alerts that actually arrive/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /full check history/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /zero configuration/i })).toBeInTheDocument();
  });

  it("renders feature body copy", () => {
    render(<Landing />);
    expect(screen.getByText(/no app to check, no dashboard to refresh/i)).toBeInTheDocument();
  });
});
