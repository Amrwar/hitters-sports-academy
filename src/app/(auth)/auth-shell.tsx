import Image from "next/image";
import Link from "next/link";
import { Lockup, Monogram } from "@/components/brand/Logo";

/** Split layout shared by login, register and password screens. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
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
      <div className="bg-court flex flex-col">
        <div className="flex flex-1 flex-col justify-center px-5 py-10 sm:px-10">
          <div className="mx-auto w-full max-w-sm animate-fade-up">
            <Link href="/" className="mb-10 flex items-center gap-3 text-white lg:hidden" aria-label="HITTERS home">
              <Monogram height={28} glow />
              <Lockup height={22} />
            </Link>
            <h1 className="text-h1">{title}</h1>
            {subtitle && <p className="mt-1.5 text-body text-fg-muted">{subtitle}</p>}
            <div className="mt-8">{children}</div>
          </div>
        </div>
        <p className="px-5 pb-6 text-center text-caption text-fg-subtle">{footer ?? "By continuing you agree to our Terms and Privacy Policy."}</p>
      </div>
    </div>
  );
}
