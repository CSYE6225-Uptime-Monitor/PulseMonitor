"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { ALLOWED_FREQUENCIES, type CreateSiteInput, type UpdateSiteInput } from "@/lib/sites";
import { Alert, Button, Checkbox, Field, Input, Select } from "@/components/ui";

export interface SiteFormValues {
  url: string;
  name: string;
  check_frequency_minutes: number;
  enabled: boolean;
}

const DEFAULT_VALUES: SiteFormValues = {
  url: "",
  name: "",
  check_frequency_minutes: 5,
  enabled: true,
};

interface SiteFormCreateProps {
  mode: "create";
  onSubmit: (input: CreateSiteInput) => Promise<void>;
}

interface SiteFormEditProps {
  mode: "edit";
  initialValues: SiteFormValues;
  onSubmit: (input: UpdateSiteInput) => Promise<void>;
}

type SiteFormProps = SiteFormCreateProps | SiteFormEditProps;

// The update schema is `.strict()` (backend/src/schemas/siteSchemas.js) and
// rejects unknown keys, so an edit submission must only include fields that
// actually changed from what the server last returned.
function diffFromInitial(initial: SiteFormValues, current: SiteFormValues): UpdateSiteInput {
  const changes: UpdateSiteInput = {};
  if (current.url !== initial.url) changes.url = current.url;
  if (current.name !== initial.name) changes.name = current.name;
  if (current.check_frequency_minutes !== initial.check_frequency_minutes) {
    changes.check_frequency_minutes = current.check_frequency_minutes;
  }
  if (current.enabled !== initial.enabled) changes.enabled = current.enabled;
  return changes;
}

export function SiteForm(props: SiteFormProps) {
  const [values, setValues] = useState<SiteFormValues>(
    props.mode === "edit" ? props.initialValues : DEFAULT_VALUES
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pendingChanges = props.mode === "edit" ? diffFromInitial(props.initialValues, values) : null;
  const canSubmit = props.mode === "create" || Object.keys(pendingChanges ?? {}).length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (props.mode === "create") {
        await props.onSubmit(values);
      } else {
        const payload = diffFromInitial(props.initialValues, values);
        if (Object.keys(payload).length === 0) {
          return;
        }
        await props.onSubmit(payload);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <Field htmlFor="site-url" label="URL" required>
        <Input
          id="site-url"
          type="url"
          required
          value={values.url}
          onChange={(e) => setValues({ ...values, url: e.target.value })}
        />
      </Field>

      <Field htmlFor="site-name" label="Name" required>
        <Input
          id="site-name"
          required
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
        />
      </Field>

      <Field htmlFor="site-frequency" label="Check frequency (minutes)">
        <Select
          id="site-frequency"
          value={String(values.check_frequency_minutes)}
          onChange={(e) => setValues({ ...values, check_frequency_minutes: Number(e.target.value) })}
        >
          {ALLOWED_FREQUENCIES.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes}
            </option>
          ))}
        </Select>
      </Field>

      <Checkbox
        id="site-enabled"
        label="Enabled"
        checked={values.enabled}
        onChange={(e) => setValues({ ...values, enabled: e.target.checked })}
      />

      <Button type="submit" disabled={submitting || !canSubmit} loading={submitting}>
        {submitting ? "Saving..." : props.mode === "create" ? "Add site" : "Save changes"}
      </Button>
    </form>
  );
}
