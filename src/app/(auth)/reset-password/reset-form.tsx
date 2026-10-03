"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { resetPasswordAction } from "@/server/actions/auth";
import { AuthShell } from "../auth-shell";

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (form.get("password") !== form.get("confirm")) {
      setFields({ confirm: "Passwords do not match." });
      return;
    }
    setLoading(true);
    setError(null);
    form.set("token", token);
    const res = await resetPasswordAction(form);
    if (res.ok) {
      router.push(res.data.next);
      router.refresh();
      return;
    }
    setFields(res.fields ?? {});
    setError(res.fields ? null : res.message);
    setLoading(false);
  }

  if (!token) {
    return (
      <AuthShell title="Link missing" subtitle="Open the reset link from your email.">
        <Button href="/forgot-password" size="lg">
          Request a new link
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Every other device will be signed out.">
      {error && (
        <Alert tone="danger" className="mb-5" action={error.toLowerCase().includes("expired") ? <Button size="sm" variant="secondary" href="/forgot-password">Request a new link</Button> : undefined}>
          {error}
        </Alert>
      )}
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field label="New password" hint="At least 10 characters with a letter and a number." error={fields.password}>
          {(id, d) => <Input id={id} name="password" type="password" autoComplete="new-password" leading={<Lock />} size="lg" required invalid={!!fields.password} aria-describedby={d} />}
        </Field>
        <Field label="Confirm password" error={fields.confirm}>
          {(id, d) => <Input id={id} name="confirm" type="password" autoComplete="new-password" leading={<Lock />} size="lg" required invalid={!!fields.confirm} aria-describedby={d} />}
        </Field>
        <Button type="submit" size="xl" fullWidth loading={loading}>
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
