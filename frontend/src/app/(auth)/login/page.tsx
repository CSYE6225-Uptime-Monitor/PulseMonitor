"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useRedirectIfAuthenticated } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Alert, Button, Card, Field, Input, TextLink } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  useRedirectIfAuthenticated();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(form);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid email or password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card padding="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">Log in</h1>
          <p className="mt-1 text-sm text-ink-subtle">Welcome back.</p>
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        <Field htmlFor="email" label="Email">
          <Input
            id="email"
            name="email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>

        <Field htmlFor="password" label="Password">
          <Input
            id="password"
            name="password"
            type="password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>

        <Button type="submit" disabled={submitting} loading={submitting} className="w-full">
          {submitting ? "Logging in..." : "Log in"}
        </Button>

        <p className="text-center text-sm text-ink-subtle">
          Need an account? <TextLink href="/signup">Sign up</TextLink>
        </p>
      </form>
    </Card>
  );
}
