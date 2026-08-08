"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useRequireAuth } from "@/lib/auth";
import { useSites } from "@/lib/useSites";
import { createSite, type CreateSiteInput } from "@/lib/sites";
import { SiteForm } from "@/components/SiteForm";
import { SiteList } from "@/components/SiteList";

export default function DashboardPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const { logout } = useAuth();
  const router = useRouter();
  const { sites, loading, error, refresh } = useSites();
  const [showForm, setShowForm] = useState(false);

  if (authLoading || !user) {
    return <p className="p-8 text-zinc-600 dark:text-zinc-400">Loading...</p>;
  }

  async function handleLogout() {
    // logout() clears local session state even when the request fails, but it
    // still rethrows (see auth.test.tsx). Catching here keeps an already-expired
    // session from surfacing as an unhandled rejection, and makes the redirect
    // explicit rather than leaving it to useRequireAuth noticing user went null.
    try {
      await logout();
    } catch {
      // Nothing actionable to show - the local session is cleared either way.
    }
    router.push("/login");
  }

  async function handleCreate(input: CreateSiteInput) {
    await createSite(input);
    setShowForm(false);
    await refresh();
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-8">
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

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Sites</h2>
        <button
          type="button"
          onClick={() => setShowForm((value) => !value)}
          className="text-sm font-medium text-zinc-600 underline dark:text-zinc-400"
        >
          {showForm ? "Cancel" : "Add site"}
        </button>
      </div>

      {showForm && <SiteForm mode="create" onSubmit={handleCreate} />}

      <SiteList sites={sites} loading={loading} error={error} />
    </div>
  );
}
