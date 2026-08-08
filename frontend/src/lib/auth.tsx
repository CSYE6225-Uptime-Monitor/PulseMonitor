"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, clearCsrfToken, onUnauthorized, type User } from "./api";

interface SignupInput {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signup: (input: SignupInput) => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await api.getCsrfToken();
        const self = await api.get<User>("/v1/user/self");
        if (!cancelled) {
          setUser(self);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // The mount-time check above only catches a session that was already
    // expired on page load. Without this, a session expiring mid-use (the
    // cookie is 24h) leaves `user` populated forever - useRequireAuth never
    // redirects, and polling hooks like useSites just repeat "Authentication
    // required." every interval.
    onUnauthorized(() => {
      clearCsrfToken();
      setUser(null);
    });

    return () => onUnauthorized(null);
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const self = await api.post<User>("/v1/login", input);
    setUser(self);
  }, []);

  const signup = useCallback(
    async (input: SignupInput) => {
      await api.post<User>("/v1/user", input);
      await login({ email: input.email, password: input.password });
    },
    [login]
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/v1/logout");
    } finally {
      // Always clear local session state, even if the request itself failed
      // (e.g. the session already expired server-side and /v1/logout 401s) -
      // otherwise the button silently does nothing and the user stays "logged in".
      clearCsrfToken();
      setUser(null);
    }
  }, []);

  // Lets a page that already has the server's response (e.g. a profile
  // update) push it into the shared context directly, instead of every
  // consumer - like the dashboard greeting - staying stuck on whatever was
  // fetched at mount until the next full page reload.
  const updateUser = useCallback((updated: User) => {
    setUser(updated);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signup, login, logout, updateUser }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

/** Redirects to /login once auth state resolves and no user is present. */
export function useRequireAuth(): { user: User | null; loading: boolean } {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  return { user, loading };
}

/** Redirects to /dashboard once auth state resolves and a user is present. */
export function useRedirectIfAuthenticated(): void {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);
}
