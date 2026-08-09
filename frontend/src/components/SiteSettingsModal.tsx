"use client";

import { useState } from "react";
import type { Site, UpdateSiteInput } from "@/lib/sites";
import { ApiError } from "@/lib/api";
import { SiteForm, type SiteFormValues } from "./SiteForm";
import { Alert, Button, Modal } from "@/components/ui";

interface SiteSettingsModalProps {
  site: Site;
  onUpdate: (input: UpdateSiteInput) => Promise<void>;
  onDelete: () => Promise<void>;
}

function GearIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

export function SiteSettingsModal({ site, onUpdate, onDelete }: SiteSettingsModalProps) {
  const [open, setOpen] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const formValues: SiteFormValues = {
    url: site.url,
    name: site.name,
    check_frequency_minutes: site.check_frequency_minutes,
    enabled: site.enabled,
  };

  function handleClose() {
    if (deleting) return;
    setOpen(false);
    setUpdateError(null);
    setConfirmingDelete(false);
    setDeleteError(null);
  }

  async function handleUpdate(input: UpdateSiteInput) {
    setUpdateError(null);
    try {
      await onUpdate(input);
      handleClose();
    } catch (err) {
      setUpdateError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Couldn't save changes. Try again.");
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete();
    } catch (err) {
      setDeleting(false);
      setDeleteError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Couldn't delete this site. Try again.");
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Site settings"
        onClick={() => setOpen(true)}
        className="focus-ring -m-1 p-1 rounded-xs text-ink-subtle transition-colors hover:text-ink"
      >
        <GearIcon />
      </button>

      <Modal open={open} onClose={handleClose} title={`Settings — ${site.name}`}>
        {/* Remount form on open so local state resets cleanly each time */}
        <SiteForm key={open ? site.updated_at : "closed"} mode="edit" initialValues={formValues} onSubmit={handleUpdate} />

        {updateError && (
          <div className="mt-3">
            <Alert tone="error">{updateError}</Alert>
          </div>
        )}

        <div className="mt-6 border-t border-hairline pt-5">
          <p className="mb-3 text-xs text-ink-subtle">
            Deleting removes this site and all of its check history permanently.
          </p>
          {deleteError && (
            <div className="mb-3">
              <Alert tone="error">{deleteError}</Alert>
            </div>
          )}
          {confirmingDelete ? (
            <div className="flex items-center gap-3">
              <Button type="button" variant="danger" loading={deleting} disabled={deleting} onClick={handleDelete}>
                {deleting ? "Deleting…" : "Confirm deletion"}
              </Button>
              <Button type="button" variant="secondary" disabled={deleting} onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button type="button" variant="danger" disabled={deleting} onClick={() => setConfirmingDelete(true)}>
              Delete site
            </Button>
          )}
        </div>
      </Modal>
    </>
  );
}
