"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Lockup, Monogram } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Checkbox, Divider } from "@/components/ui/misc";

export default function LoginPage() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!String(form.get("email")).includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setLoading(true);
    // UI shell only: authentication is wired in a later phase.
    setTimeout(() => router.push("/splash"), 700);
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-court lg:block">
        <Image src="/brand/monogram-3d.jpg" alt="" fill priority sizes="60vw" className="object-contain object-center opacity-80 [mask-image:radial-gradient(55%_55%_at_50%_50%,black_35%,transparent_72%)]" />
        <div className="absolute inset-x-0 bottom-0 h-72 bg-[linear-gradient(180deg,rgba(3,7,18,0)_0%,rgba(3,7,18,0.9)_100%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Link href="/" aria-label="HITTERS home">
            <Lockup height={30} glow />
          </Link>
          <div>
            <h2 className="max-w-md text-display">Your court is waiting.</h2>
            <p className="mt-3 max-w-md text-body-lg text-blue-100/80">Book in seconds, get matched by level and track every session across all HITTERS clubs.</p>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="bg-court flex flex-col">
        <div className="flex flex-1 flex-col justify-center px-5 py-10 sm:px-10">
          <div className="mx-auto w-full max-w-sm animate-fade-up">
            <Link href="/" className="mb-10 flex items-center gap-3 text-white lg:hidden" aria-label="HITTERS home">
              <Monogram height={28} glow />
              <Lockup height={22} />
            </Link>
            <h1 className="text-h1">Welcome back</h1>
            <p className="mt-1.5 text-body text-fg-muted">Sign in to book, play and train.</p>

            <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
              <Field label="Email" error={error ?? undefined}>
                {(id, describedBy) => (
                  <Input id={id} name="email" type="email" autoComplete="email" placeholder="you@example.com" leading={<Mail />} invalid={!!error} aria-describedby={describedBy} size="lg" />
                )}
              </Field>
              <Field label="Password">
                {(id) => (
                  <Input
                    id={id}
                    name="password"
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    leading={<Lock />}
                    size="lg"
                    trailing={
                      <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} className="rounded-xs p-1 hover:text-fg">
                        {show ? <EyeOff /> : <Eye />}
                      </button>
                    }
                  />
                )}
              </Field>
              <div className="flex items-center justify-between">
                <Checkbox label="Keep me signed in" name="remember" />
                <Link href="#" className="text-body-sm font-semibold text-blue-300 hover:text-blue-200">
                  Forgot password?
                </Link>
              </div>
              <Button type="submit" size="xl" fullWidth loading={loading}>
                Sign in
              </Button>
            </form>

            <Divider label="or continue with" className="my-6" />
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" size="lg">
                Google
              </Button>
              <Button variant="secondary" size="lg">
                Apple
              </Button>
            </div>
            <p className="mt-8 text-center text-body-sm text-fg-muted">
              New to HITTERS?{" "}
              <Link href="#" className="font-semibold text-blue-300 hover:text-blue-200">
                Create an account
              </Link>
            </p>
          </div>
        </div>
        <p className="px-5 pb-6 text-center text-caption text-fg-subtle">By signing in you agree to our Terms and Privacy Policy.</p>
      </div>
    </div>
  );
}
