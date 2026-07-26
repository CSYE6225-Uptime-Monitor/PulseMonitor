"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type User } from "./api";

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
    await api.post("/v1/logout");
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, signup, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
