"use client";

import { useState } from "react";
import { useRequireAuth } from "@/lib/auth";
import { useSites } from "@/lib/useSites";
import { useSiteHistories } from "@/lib/useSiteHistories";
import { createSite, type CreateSiteInput } from "@/lib/sites";
import { SiteForm } from "@/components/SiteForm";
import { SiteList } from "@/components/SiteList";
import { Button, Card, CardBody, PageHeader } from "@/components/ui";

export default function DashboardPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const { sites, loading, error, refresh } = useSites();
  const histories = useSiteHistories(sites);
  const [showForm, setShowForm] = useState(false);

  // The (app) layout already gates on auth and shows a skeleton while it
  // resolves; this is just a type-narrowing guard, not a second loading UI.
  if (authLoading || !user) {
    return null;
  }

  async function handleCreate(input: CreateSiteInput) {
    await createSite(input);
    setShowForm(false);
    await refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sites"
        description={`Welcome back, ${user.first_name} ${user.last_name}.`}
        actions={
          <Button type="button" variant={showForm ? "secondary" : "primary"} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "Add site"}
          </Button>
        }
      />

      {showForm && (
        <Card padding="none">
          <CardBody>
            <SiteForm mode="create" onSubmit={handleCreate} />
          </CardBody>
        </Card>
      )}

      <SiteList sites={sites} loading={loading} error={error} histories={histories} />
    </div>
  );
}
