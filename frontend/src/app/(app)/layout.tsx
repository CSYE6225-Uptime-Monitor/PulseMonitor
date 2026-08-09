"use client";

import { useRouter } from "next/navigation";
import { useAuth, useRequireAuth } from "@/lib/auth";
import { AppShell, AppShellFallback } from "@/components/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRequireAuth();
  const { logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    // logout() clears local session state even when the request fails but
    // still rethrows (see auth.test.tsx). Swallow it and redirect
    // unconditionally - the local session is cleared either way.
    try {
      await logout();
    } catch {
      // Nothing actionable to show.
    }
    router.push("/login");
  }

  if (loading || !user) {
    return <AppShellFallback />;
  }

  return (
    <AppShell user={user} onLogout={handleLogout}>
      {children}
    </AppShell>
  );
}
