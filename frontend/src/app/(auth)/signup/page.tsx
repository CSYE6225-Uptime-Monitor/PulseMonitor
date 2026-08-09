"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useRedirectIfAuthenticated } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Alert, Button, Card, Field, Input, TextLink } from "@/components/ui";

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();
  useRedirectIfAuthenticated();
  const [form, setForm] = useState({ email: "", password: "", first_name: "", last_name: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      await signup(form);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create your account. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card padding="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">Create your account</h1>
          <p className="mt-1 text-sm text-ink-subtle">Start monitoring in under a minute.</p>
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="grid grid-cols-2 gap-3">
          <Field htmlFor="first_name" label="First name" required>
            <Input
              id="first_name"
              name="first_name"
              required
              autoComplete="given-name"
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            />
          </Field>
          <Field htmlFor="last_name" label="Last name" required>
            <Input
              id="last_name"
              name="last_name"
              required
              autoComplete="family-name"
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            />
          </Field>
        </div>

        <Field htmlFor="email" label="Email" required>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>

        <Field htmlFor="password" label="Password" required>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>

        <Button type="submit" disabled={submitting} loading={submitting} className="w-full">
          {submitting ? "Creating account..." : "Sign up"}
        </Button>

        <p className="text-center text-sm text-ink-subtle">
          Already have an account? <TextLink href="/login">Log in</TextLink>
        </p>
      </form>
    </Card>
  );
}
