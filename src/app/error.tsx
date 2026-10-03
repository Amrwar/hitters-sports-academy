"use client";

import { Lockup } from "@/components/brand/Logo";
import { ErrorState } from "@/components/ui/states";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="bg-court flex min-h-dvh flex-col items-center justify-center px-6 text-white">
      <Lockup height={24} className="mb-10" />
      <ErrorState className="w-full max-w-md bg-surface-1/60 backdrop-blur-xl" description="An unexpected error interrupted play. Try again or come back in a moment." onRetry={reset} />
    </div>
  );
}
