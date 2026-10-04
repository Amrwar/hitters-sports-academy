import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/* ------------------------------------------------------------ Photo backdrop */

/** Brand photography with the navy-to-electric overlay used on every hero and media card. */
export function CourtBackdrop({ src, className, children, priority, overlay = "strong" }: { src: string; className?: string; children?: ReactNode; priority?: boolean; overlay?: "strong" | "soft" }) {
  return (
    <div className={cn("relative overflow-hidden text-white", className)} data-theme="dark">
      <Image src={src} alt="" fill priority={priority} sizes="(max-width: 768px) 100vw, 1200px" className="object-cover" />
      <div
        className={cn(
          "absolute inset-0",
          overlay === "strong"
            ? "bg-[linear-gradient(180deg,rgba(3,7,18,0.15)_0%,rgba(3,7,18,0.55)_55%,rgba(3,7,18,0.95)_100%)]"
            : "bg-[linear-gradient(180deg,rgba(3,7,18,0)_30%,rgba(3,7,18,0.85)_100%)]",
        )}
      />
      <div className="absolute inset-0 bg-blue-700/20 mix-blend-multiply" />
      {children && <div className="relative">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------ Quick action tile */

export function QuickAction({ href, icon, label, hint }: { href: string; icon: ReactNode; label: string; hint?: string }) {
  return (
    <Link href={href} className="group flex flex-col gap-3 rounded-lg border border-line/10 bg-surface-1 p-4 shadow-inset-hi transition-all hover:border-blue-400/50 hover:shadow-glow-sm active:scale-[0.98]">
      <span className="flex size-10 items-center justify-center rounded-md bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-400/20 transition-colors group-hover:bg-brand-gradient group-hover:text-white [&_svg]:size-5">{icon}</span>
      <span>
        <span className="block text-body font-bold">{label}</span>
        {hint && <span className="block text-caption text-fg-muted">{hint}</span>}
      </span>
    </Link>
  );
}
