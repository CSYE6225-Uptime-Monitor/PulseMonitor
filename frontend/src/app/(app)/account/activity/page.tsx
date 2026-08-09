"use client";

import { useRequireAuth } from "@/lib/auth";
import { useActivity } from "@/lib/useActivity";
import { ActivityTable } from "@/components/ActivityTable";
import { Alert, Card, PageHeader, TextLink } from "@/components/ui";

export default function AccountActivityPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const { events, nextCursor, loading, loadingMore, error, loadMore } = useActivity();

  // The (app) layout already gates on auth and shows a skeleton while it
  // resolves; this is just a type-narrowing guard, not a second loading UI.
  if (authLoading || !user) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <TextLink href="/account" className="inline-flex items-center gap-1.5 text-ink-subtle hover:text-accent">
        ← Back to account
      </TextLink>

      <PageHeader
        title="Account activity"
        description="Sign-ins, profile changes, and site changes."
      />

      <Card padding="none">
        {loading ? (
          <p role="status" className="p-6 text-sm text-ink-subtle">
            Loading activity...
          </p>
        ) : error ? (
          <div className="p-6">
            <Alert tone="error">{error}</Alert>
          </div>
        ) : (
          <ActivityTable
            events={events}
            nextCursor={nextCursor}
            onLoadMore={() => void loadMore()}
            loadingMore={loadingMore}
          />
        )}
      </Card>
    </div>
  );
}
