import type { Site } from "@/lib/sites";
import type { SiteUptimeEntry } from "@/lib/useSiteHistories";
import { Alert, EmptyState, Skeleton } from "@/components/ui";
import { SiteCard } from "./SiteCard";

interface SiteListProps {
  sites: Site[];
  loading: boolean;
  error: string | null;
  histories?: Record<string, SiteUptimeEntry>;
}

export function SiteList({ sites, loading, error, histories = {} }: SiteListProps) {
  if (loading) {
    return (
      <div role="status" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <span className="sr-only">Loading sites…</span>
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  // Only replace the whole view with the error when there's nothing to show
  // instead - a poll failing after sites already loaded must not discard
  // still-valid data for up to 60s until the next poll succeeds (useSites.ts).
  if (error && sites.length === 0) {
    return <Alert tone="error">{error}</Alert>;
  }

  if (sites.length === 0) {
    return (
      <EmptyState
        title="No sites yet"
        description="Add one to start monitoring it."
      />
    );
  }

  return (
    <>
      {error && <Alert tone="error">{error}</Alert>}
      <ul role="list" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sites.map((site) => (
          <li key={site.site_id}>
            <SiteCard site={site} history={histories[site.site_id]} />
          </li>
        ))}
      </ul>
    </>
  );
}
