"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth, useRequireAuth } from "@/lib/auth";
import { ApiError, type User } from "@/lib/api";
import { updateSelf } from "@/lib/account";
import { useExports } from "@/lib/useExports";
import { ExportList } from "@/components/ExportList";
import { Alert, Button, Card, CardBody, CardFooter, CardHeader, Field, Input, PageHeader } from "@/components/ui";

export default function AccountPage() {
  const { user, loading } = useRequireAuth();

  // The (app) layout already gates on auth and shows a skeleton while it
  // resolves; this is just a type-narrowing guard, not a second loading UI.
  if (loading || !user) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader title="Account" description="Manage your profile and export your data." />
      <AccountForm key={user.email} user={user} />
      <DataExportSection />

      <Card padding="none">
        <Link
          href="/account/activity"
          aria-label="Account activity"
          className="focus-ring flex items-center justify-between gap-3 px-6 py-4 transition-colors hover:bg-surface-subtle"
        >
          <span>
            <span aria-hidden="true" className="block text-sm font-medium text-ink">
              Account activity
            </span>
            <span aria-hidden="true" className="mt-0.5 block text-xs text-ink-subtle">
              View recent sign-ins and changes.
            </span>
          </span>
          <span aria-hidden="true" className="text-ink-faint">
            →
          </span>
        </Link>
      </Card>
    </div>
  );
}

function AccountForm({ user }: { user: User }) {
  const { updateUser } = useAuth();
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
      const updated = await updateSelf(form);
      // Without this, AuthContext.user keeps whatever was fetched at mount -
      // the dashboard greeting and any other consumer stays stale until a
      // full page reload, even though the update itself succeeded.
      updateUser(updated);
      setMessage("Account updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card padding="none">
      <CardHeader title="Profile" />
      <form onSubmit={handleUpdate}>
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between border-b border-hairline pb-4">
            <div>
              <p className="text-sm font-medium text-ink">{user.email}</p>
              <p className="text-xs text-ink-subtle">Email can&apos;t be changed.</p>
            </div>
          </div>

          {error && <Alert tone="error">{error}</Alert>}
          {message && <Alert tone="success">{message}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="first_name" label="First name">
              <Input
                id="first_name"
                name="first_name"
                required
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              />
            </Field>
            <Field htmlFor="last_name" label="Last name">
              <Input
                id="last_name"
                name="last_name"
                required
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              />
            </Field>
          </div>
        </CardBody>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={submitting} loading={submitting}>
            {submitting ? "Saving..." : "Save changes"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function DataExportSection() {
  const { exports, loading, error, requestExport, requesting, download, downloadingId, actionError } = useExports();

  return (
    <Card padding="none">
      <CardHeader
        title="Export your data"
        description="Download a copy of your profile, sites, and recent history."
        actions={
          <Button type="button" onClick={() => void requestExport()} disabled={requesting} loading={requesting}>
            {requesting ? "Requesting..." : "Request export"}
          </Button>
        }
      />
      <CardBody>
        {actionError && (
          <Alert tone="error" className="mb-4">
            {actionError}
          </Alert>
        )}
        <ExportList
          exports={exports}
          loading={loading}
          error={error}
          onDownload={(exportId) => void download(exportId)}
          downloadingId={downloadingId}
        />
      </CardBody>
    </Card>
  );
}
