"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Mail, Menu, Phone, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Lockup, Monogram, Wordmark } from "@/components/brand/Logo";
import { Button, IconButton } from "@/components/ui/button";

const links = [
  { href: "/#locations", label: "Locations" },
  { href: "/#play", label: "Play" },
  { href: "/#academy", label: "Academy" },
  { href: "/#how", label: "How it works" },
  { href: "/#membership", label: "Membership" },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // The bar is transparent over the hero and frosts once the page moves, so the logo never fights the art.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={cn("fixed inset-x-0 top-0 z-40 transition-colors duration-300", scrolled && "border-b border-white/10 bg-navy-950/80 backdrop-blur-xl")}>
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-white" aria-label="HITTERS Sports Academy, home">
          <Monogram height={22} glow />
          <Wordmark height={15} />
        </Link>
        <nav className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-xl lg:flex" aria-label="Main">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="rounded-full px-4 py-2 text-body-sm font-semibold text-blue-100/80 transition-colors hover:bg-white/10 hover:text-white">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <Button variant="ghost" href="/login" className="text-blue-100">
            Sign in
          </Button>
          <Button href="/app">Open app</Button>
        </div>
        <IconButton variant="ghost" label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)} className="text-white lg:hidden">
          {open ? <X /> : <Menu />}
        </IconButton>
      </div>
      <div className={cn("lg:hidden", open ? "block" : "hidden")}>
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

/** Every link here goes somewhere real: a section of this page, a screen in the app, or a way to reach us. */
const footerColumns: { title: string; items: { label: string; href: string }[] }[] = [
  {
    title: "Play",
    items: [
      { label: "Book a court", href: "/app/book" },
      { label: "Find a match", href: "/app/play/find" },
      { label: "Organize a game", href: "/app/play/new" },
      { label: "Play with a partner", href: "/app/play/pairs" },
    ],
  },
  {
    title: "Academy",
    items: [
      { label: "Programs", href: "/app/programs" },
      { label: "Private coaching", href: "/app/trainers" },
      { label: "Training packages", href: "/app/packages" },
      { label: "Levels A to D", href: "/#play" },
    ],
  },
  {
    title: "Club",
    items: [
      { label: "Locations", href: "/app/locations" },
      { label: "Membership", href: "/#membership" },
      { label: "Create an account", href: "/register" },
      { label: "Sign in", href: "/login" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/10 bg-navy-950">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="text-white">
          <Lockup height={22} />
          <p className="mt-4 max-w-xs text-body-sm text-blue-100/60">Premium padel courts, smart matchmaking and world-class coaching across Egypt.</p>
          <div className="mt-5 space-y-2 text-body-sm text-blue-100/70">
            <a href="tel:+201000000000" className="flex items-center gap-2 transition-colors hover:text-white">
              <Phone size={14} className="text-blue-300" /> +20 100 000 0000
            </a>
            <a href="mailto:hello@hitters.academy" className="flex items-center gap-2 transition-colors hover:text-white">
              <Mail size={14} className="text-blue-300" /> hello@hitters.academy
            </a>
          </div>
        </div>
        {footerColumns.map((col) => (
          <div key={col.title}>
            <div className="text-overline uppercase text-blue-300">{col.title}</div>
            <ul className="mt-3 space-y-2">
              {col.items.map((i) => (
                <li key={i.label}>
                  <Link href={i.href} className="text-body-sm text-blue-100/70 transition-colors hover:text-white">
                    {i.label}
                  </Link>
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
