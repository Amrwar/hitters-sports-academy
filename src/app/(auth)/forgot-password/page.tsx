"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Mail, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { ConfirmationState } from "@/components/ui/states";
import { requestPasswordResetAction } from "@/server/actions/auth";
import { AuthShell } from "../auth-shell";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await requestPasswordResetAction(new FormData(e.currentTarget));
    setLoading(false);
    if (res.ok) setSent(true);
    else setError(res.message);
  }

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to choose a new one.">
      {sent ? (
        <ConfirmationState title="Check your inbox" description="If an account exists for that email, a reset link is on its way. It expires in one hour." action={<Button variant="secondary" href="/login" leftIcon={<MailCheck />}>Back to sign in</Button>} />
      ) : (
        <>
          {error && (
            <Alert tone="danger" className="mb-5">
              {error}
            </Alert>
          )}
          <form onSubmit={submit} className="space-y-5" noValidate>
            <Field label="Email">{(id) => <Input id={id} name="email" type="email" autoComplete="email" placeholder="you@example.com" leading={<Mail />} size="lg" required />}</Field>
            <Button type="submit" size="xl" fullWidth loading={loading}>
              Send reset link
            </Button>
          </form>
          <p className="mt-8 text-center text-body-sm text-fg-muted">
            Remembered it?{" "}
            <Link href="/login" className="font-semibold text-blue-300 hover:text-blue-200">
              Sign in
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
