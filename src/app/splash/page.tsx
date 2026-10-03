"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppIcon, Lockup } from "@/components/brand/Logo";

/** Splash / loading screen shown while the session and profile load. */
export default function SplashPage() {
  const router = useRouter();
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    const steps = [30, 55, 80, 100];
    const timers = steps.map((p, i) => setTimeout(() => setProgress(p), 300 + i * 350));
    const done = setTimeout(() => router.replace("/app"), 2100);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [router]);

  return (
    <div className="bg-court flex min-h-dvh flex-col items-center justify-center px-6 text-white court-line">
      <div className="relative flex flex-col items-center animate-scale-in">
        <div className="absolute -inset-16 rounded-full bg-blue-500/25 blur-3xl animate-pulse" aria-hidden />
        <AppIcon size={104} className="relative" />
        <Lockup height={26} className="relative mt-8" />
      </div>
      <div className="absolute inset-x-0 bottom-14 mx-auto flex w-56 flex-col items-center gap-3">
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={progress} aria-valuemax={100} aria-label="Loading">
          <div className="h-full rounded-full bg-brand-gradient shadow-glow-sm transition-[width] duration-300 ease-out" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-caption text-blue-100/60">Preparing your court…</span>
      </div>
    </div>
  );
}
