"use client";

import { useRequireAuth } from "@/lib/auth";
import { useActivity } from "@/lib/useActivity";
import { ActivityTable } from "@/components/ActivityTable";

export default function AccountActivityPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const { events, nextCursor, loading, loadingMore, error, loadMore } = useActivity();

  if (authLoading || !user) {
    return <p className="p-8 text-zinc-600 dark:text-zinc-400">Loading...</p>;
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-8">
      <a href="/account" className="block text-sm font-medium text-zinc-600 underline dark:text-zinc-400">
        Back to account
      </a>

      <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">Account activity</h1>

      {loading ? (
        <p className="text-zinc-600 dark:text-zinc-400">Loading activity...</p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : (
        <ActivityTable
          events={events}
          nextCursor={nextCursor}
          onLoadMore={() => void loadMore()}
          loadingMore={loadingMore}
        />
      )}
    </div>
  );
}
