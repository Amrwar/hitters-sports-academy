"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Checkbox, Divider } from "@/components/ui/misc";
import { loginAction } from "@/server/actions/auth";
import { AuthShell } from "../auth-shell";

export function LoginForm({ next, suspended }: { next: string; suspended: boolean }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    form.set("next", next);
    const res = await loginAction(form);
    if (res.ok) {
      router.push(res.data.next);
      router.refresh();
      return;
    }
    setFields(res.fields ?? {});
    setError(res.message);
    setLoading(false);
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to book, play and train.">
      {suspended && (
        <Alert tone="danger" title="Account suspended" className="mb-5">
          Contact support to restore access.
        </Alert>
      )}
      {error && !fields.password && (
        <Alert tone="danger" className="mb-5">
          {error}
        </Alert>
      )}
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field label="Email" error={fields.email}>
          {(id, d) => <Input id={id} name="email" type="email" autoComplete="email" placeholder="you@example.com" leading={<Mail />} invalid={!!fields.email} aria-describedby={d} size="lg" required />}
        </Field>
        <Field label="Password" error={fields.password}>
          {(id, d) => (
            <Input
              id={id}
              name="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              leading={<Lock />}
              size="lg"
              required
              invalid={!!fields.password}
              aria-describedby={d}
              trailing={
                <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} className="rounded-xs p-1 hover:text-fg">
                  {show ? <EyeOff /> : <Eye />}
                </button>
              }
            />
          )}
        </Field>
        <div className="flex items-center justify-between">
          <Checkbox label="Keep me signed in" name="remember" defaultChecked />
          <Link href="/forgot-password" className="text-body-sm font-semibold text-blue-300 hover:text-blue-200">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="xl" fullWidth loading={loading}>
          Sign in
        </Button>
      </form>
      <Divider label="or continue with" className="my-6" />
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" size="lg" disabled title="Coming soon">
          Google
        </Button>
        <Button variant="secondary" size="lg" disabled title="Coming soon">
          Apple
        </Button>
      </div>
      <p className="mt-8 text-center text-body-sm text-fg-muted">
        New to HITTERS?{" "}
        <Link href="/register" className="font-semibold text-blue-300 hover:text-blue-200">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
