"use client";

import { useRouter } from "next/navigation";
import { useAuth, useRequireAuth } from "@/lib/auth";

export default function DashboardPage() {
  const { user, loading } = useRequireAuth();
  const { logout } = useAuth();
  const router = useRouter();

  if (loading || !user) {
    return <p className="p-8 text-zinc-600 dark:text-zinc-400">Loading...</p>;
  }

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <div className="mx-auto w-full max-w-sm space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">Dashboard</h1>
        <button
          type="button"
          onClick={handleLogout}
          className="text-sm font-medium text-zinc-600 underline dark:text-zinc-400"
        >
          Log out
        </button>
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Welcome back, {user.first_name} {user.last_name}.
      </p>

      <a href="/account" className="block text-sm font-medium text-zinc-950 underline dark:text-zinc-50">
        Manage account
      </a>
    </div>
  );
}
