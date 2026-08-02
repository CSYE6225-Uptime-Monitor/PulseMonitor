import type { Site } from "@/lib/sites";
import { StatusBadge } from "./StatusBadge";

interface SiteListProps {
  sites: Site[];
  loading: boolean;
  error: string | null;
}

export function SiteList({ sites, loading, error }: SiteListProps) {
  if (loading) {
    return <p>Loading sites...</p>;
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }

  if (sites.length === 0) {
    return <p>No sites yet. Add one to start monitoring it.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>URL</th>
          <th>Status</th>
          <th>Last checked</th>
          <th>Latency</th>
        </tr>
      </thead>
      <tbody>
        {sites.map((site) => (
          <tr key={site.site_id}>
            <td>
              <a href={`/sites/${site.site_id}`}>{site.name}</a>
            </td>
            <td>{site.url}</td>
            <td>
              <StatusBadge status={site.status.status} />
            </td>
            <td>{site.status.checked_at ? new Date(site.status.checked_at).toLocaleString() : "Never checked"}</td>
            <td>{site.status.latency_ms !== null ? `${site.status.latency_ms} ms` : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
