"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useRequireAuth } from "@/lib/auth";
import { api, ApiError, type User } from "@/lib/api";

export default function AccountPage() {
  const { user, loading } = useRequireAuth();
  const { logout } = useAuth();

  if (loading || !user) {
    return <p className="p-8 text-zinc-600 dark:text-zinc-400">Loading...</p>;
  }

  return <AccountForm key={user.email} user={user} onLogout={logout} />;
}

function AccountForm({ user, onLogout }: { user: User; onLogout: () => Promise<void> }) {
  const router = useRouter();
  const [form, setForm] = useState({ first_name: user.first_name, last_name: user.last_name });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleUpdate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await api.put<User>("/v1/user/self", form);
      setMessage("Account updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    await onLogout();
    router.push("/login");
  }

  return (
    <div className="mx-auto w-full max-w-sm space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">My account</h1>
        <button
          type="button"
          onClick={handleLogout}
          className="text-sm font-medium text-zinc-600 underline dark:text-zinc-400"
        >
          Log out
        </button>
      </div>

      <a href="/dashboard" className="block text-sm font-medium text-zinc-950 underline dark:text-zinc-50">
        Back to dashboard
      </a>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">{user.email}</p>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          {message}
        </p>
      )}

      <form onSubmit={handleUpdate} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="first_name">
            First name
          </label>
          <input
            id="first_name"
            name="first_name"
            required
            value={form.first_name}
            onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="last_name">
            Last name
          </label>
          <input
            id="last_name"
            name="last_name"
            required
            value={form.last_name}
            onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-zinc-950 px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
        >
          {submitting ? "Saving..." : "Save changes"}
        </button>
      </form>
    </div>
  );
}
