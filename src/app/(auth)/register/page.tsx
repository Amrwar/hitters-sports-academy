"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, Phone, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { registerAction } from "@/server/actions/auth";
import { AuthShell } from "../auth-shell";


export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await registerAction(new FormData(e.currentTarget));
    if (res.ok) {
      router.push(res.data.next);
      router.refresh();
      return;
    }
    setFields(res.fields ?? {});
    setError(res.fields ? null : res.message);
    setLoading(false);
  }

  return (
    <AuthShell title="Create your account" subtitle="One account for every HITTERS club.">
      {error && (
        <Alert tone="danger" className="mb-5">
          {error}
        </Alert>
      )}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Full name" error={fields.name}>
          {(id, d) => <Input id={id} name="name" autoComplete="name" placeholder="Amr Hefny" leading={<User />} invalid={!!fields.name} aria-describedby={d} size="lg" required />}
        </Field>
        <Field label="Email" error={fields.email}>
          {(id, d) => <Input id={id} name="email" type="email" autoComplete="email" placeholder="you@example.com" leading={<Mail />} invalid={!!fields.email} aria-describedby={d} size="lg" required />}
        </Field>
        <Field label="Phone" hint="Optional. Used for booking reminders." error={fields.phone}>
          {(id, d) => <Input id={id} name="phone" type="tel" autoComplete="tel" placeholder="01x xxxx xxxx" leading={<Phone />} invalid={!!fields.phone} aria-describedby={d} size="lg" />}
        </Field>
        <Field label="Password" hint="At least 10 characters with a letter and a number." error={fields.password}>
          {(id, d) => <Input id={id} name="password" type="password" autoComplete="new-password" placeholder="••••••••••" leading={<Lock />} invalid={!!fields.password} aria-describedby={d} size="lg" required />}
        </Field>
        <Button type="submit" size="xl" fullWidth loading={loading} className="mt-2">
          Create account
        </Button>
      </form>
      <p className="mt-8 text-center text-body-sm text-fg-muted">
        Already a HITTER?{" "}
        <Link href="/login" className="font-semibold text-blue-300 hover:text-blue-200">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
