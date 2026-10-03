import { MailWarning } from "lucide-react";
import { Lockup } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { ConfirmationState, EmptyState } from "@/components/ui/states";
import { verifyEmail } from "@/server/services/auth";
import { getActor } from "@/lib/auth/cookies";

export const dynamic = "force-dynamic";

/** Landing page for the verification link. Consumes the token server-side. */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  let ok = false;
  if (token) {
    try {
      await verifyEmail({ token });
      ok = true;
    } catch {
      ok = false;
    }
  }
  const actor = await getActor();
  const next = actor ? "/app" : "/login";

  return (
    <div className="bg-court flex min-h-dvh flex-col items-center justify-center px-6 text-white">
      <Lockup height={24} className="mb-10" />
      <div className="w-full max-w-md rounded-lg border border-line/10 bg-surface-1/60 backdrop-blur-xl">
        {ok ? (
          <ConfirmationState title="Email verified" description="Your HITTERS account is fully active." action={<Button size="lg" href={next}>{actor ? "Go to the app" : "Sign in"}</Button>} />
        ) : (
          <EmptyState
            icon={<MailWarning />}
            title="This link isn't valid"
            description="It may have expired or already been used. Sign in and request a new verification email from your profile."
            action={<Button href={next}>{actor ? "Go to the app" : "Sign in"}</Button>}
            className="border-0"
          />
        )}
      </div>
    </div>
  );
}
