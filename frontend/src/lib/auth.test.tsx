import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";
import type { User } from "./api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("./api", () => ({
  api: {
    getCsrfToken: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
  },
  clearCsrfToken: vi.fn(),
  onUnauthorized: vi.fn(),
}));

import { api, clearCsrfToken, onUnauthorized } from "./api";
import { AuthProvider, useAuth } from "./auth";

const exampleUser: User = {
  email: "jane@example.com",
  user_id: "11111111-1111-1111-1111-111111111111",
  first_name: "Jane",
  last_name: "Doe",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.mocked(api.getCsrfToken).mockReset().mockResolvedValue("token");
    vi.mocked(api.get).mockReset().mockResolvedValue(exampleUser);
    vi.mocked(api.post).mockReset();
    vi.mocked(clearCsrfToken).mockReset();
    vi.mocked(onUnauthorized).mockReset();
  });

  describe("logout", () => {
    it("clears local session state after a successful logout", async () => {
      vi.mocked(api.post).mockResolvedValue(undefined);
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.logout();
      });

      expect(clearCsrfToken).toHaveBeenCalled();
      expect(result.current.user).toBeNull();
    });

    it("still clears local session state when the logout request itself fails", async () => {
      // Models an already-expired session: /v1/logout 401s, so the request
      // rejects, but the user is still "logged in" client-side until we clear it.
      vi.mocked(api.post).mockRejectedValue(new Error("401"));
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await expect(result.current.logout()).rejects.toThrow();
      });

      expect(clearCsrfToken).toHaveBeenCalled();
      expect(result.current.user).toBeNull();
    });
  });

  describe("updateUser", () => {
    it("pushes a server-returned user into context without a re-fetch", async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.user).toEqual(exampleUser));

      const updated: User = { ...exampleUser, first_name: "Janet" };
      act(() => {
        result.current.updateUser(updated);
      });

      expect(result.current.user).toEqual(updated);
    });
  });

  describe("unauthorized listener", () => {
    it("registers a listener on mount that clears the session, and unsubscribes on unmount", async () => {
      const { unmount } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));

      const [listener] = vi.mocked(onUnauthorized).mock.calls[0];
      expect(typeof listener).toBe("function");

      unmount();
      expect(onUnauthorized).toHaveBeenLastCalledWith(null);
    });

    it("clears the user when the registered listener fires, e.g. from a 401 on any request", async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.user).toEqual(exampleUser));

      const [listener] = vi.mocked(onUnauthorized).mock.calls[0];
      expect(listener).not.toBeNull();

      act(() => {
        listener!();
      });

      expect(clearCsrfToken).toHaveBeenCalled();
      expect(result.current.user).toBeNull();
    });
  });
});
