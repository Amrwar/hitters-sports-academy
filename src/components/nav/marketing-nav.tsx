"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Lockup, Monogram, Wordmark } from "@/components/brand/Logo";
import { Button, IconButton } from "@/components/ui/button";

const links = [
  { href: "#locations", label: "Locations" },
  { href: "#play", label: "Play" },
  { href: "#academy", label: "Academy" },
  { href: "#membership", label: "Membership" },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-white" aria-label="HITTERS Sports Academy">
          <Monogram height={22} glow />
          <Wordmark height={15} />
        </Link>
        <nav className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-xl md:flex" aria-label="Marketing">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="rounded-full px-4 py-2 text-body-sm font-semibold text-blue-100/80 transition-colors hover:bg-white/10 hover:text-white">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Button variant="ghost" href="/login" className="text-blue-100">
            Sign in
          </Button>
          <Button href="/app">Open app</Button>
        </div>
        <IconButton variant="ghost" label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)} className="text-white md:hidden">
          {open ? <X /> : <Menu />}
        </IconButton>
      </div>
      <div className={cn("md:hidden", open ? "block" : "hidden")}>
        <div className="mx-4 rounded-xl border border-white/10 bg-navy-900/95 p-3 shadow-lg backdrop-blur-xl animate-scale-in">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-md px-3 py-2.5 text-body font-semibold text-blue-100 hover:bg-white/5">
              {l.label}
            </a>
          ))}
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
            <Button variant="secondary" href="/login">
              Sign in
            </Button>
            <Button href="/app">Open app</Button>
          </div>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/10 bg-navy-950">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="text-white">
          <Lockup height={22} />
          <p className="mt-4 max-w-xs text-body-sm text-blue-100/60">Premium padel courts, smart matchmaking and world-class coaching across Egypt.</p>
        </div>
        {[
          { title: "Play", items: ["Book a court", "Find a match", "Levels A–D", "Tournaments"] },
          { title: "Academy", items: ["Programs", "Private trainers", "Junior academy", "Memberships"] },
          { title: "Company", items: ["Locations", "Careers", "Contact", "Privacy"] },
        ].map((col) => (
          <div key={col.title}>
            <div className="text-overline uppercase text-blue-300">{col.title}</div>
            <ul className="mt-3 space-y-2">
              {col.items.map((i) => (
                <li key={i}>
                  <a href="#" className="text-body-sm text-blue-100/70 hover:text-white">
                    {i}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 py-5 text-center text-caption text-blue-100/40">© {new Date().getFullYear()} HITTERS Sports Academy. All rights reserved.</div>
    </footer>
  );
}
