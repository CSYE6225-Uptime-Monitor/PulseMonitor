import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const mockUseRedirectIfAuthenticated = vi.fn();
vi.mock("@/lib/auth", () => ({
  useRedirectIfAuthenticated: () => mockUseRedirectIfAuthenticated(),
}));

vi.mock("@/components/Landing", () => ({
  Landing: () => <div data-testid="landing-stub">Landing</div>,
}));

import Home from "@/app/page";

describe("Home (root page)", () => {
  beforeEach(() => {
    mockUseRedirectIfAuthenticated.mockReset();
  });

  it("renders the Landing component", () => {
    render(<Home />);
    expect(screen.getByTestId("landing-stub")).toBeInTheDocument();
  });

  it("calls useRedirectIfAuthenticated so authenticated users are sent to /dashboard", () => {
    render(<Home />);
    expect(mockUseRedirectIfAuthenticated).toHaveBeenCalledTimes(1);
  });
});
