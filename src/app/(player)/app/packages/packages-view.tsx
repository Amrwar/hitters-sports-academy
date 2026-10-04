"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, MapPin, Package, Receipt, Users } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { money } from "@/components/patterns/booking-status";
import { LessonStatusBadge, PurchaseCard } from "@/components/patterns/academy";
import { formatInZone } from "@/lib/time";
import type { PackageView, PurchaseView } from "@/server/services/packages";
import { purchasePackageAction } from "@/server/actions/academy";
import { count } from "@/lib/text";
import { cn } from "@/lib/cn";

/** What one lesson works out to. Credits are validated above zero, but a stray row should not print NaN. */
const perLesson = (c: PackageView): number => (c.credits > 0 ? Math.round(c.priceCents / c.credits) : c.priceCents);

export function PackagesView({ purchases, catalog }: { purchases: PurchaseView[]; catalog: PackageView[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [buy, setBuy] = useState<PackageView | null>(null);
  const [busy, setBusy] = useState(false);
  const active = purchases.filter((p) => p.status === "ACTIVE");
  const history = purchases.flatMap((p) => p.redemptions.map((r) => ({ ...r, purchase: p })));
  const cheapest = catalog.length ? Math.min(...catalog.map(perLesson)) : 0;

  async function confirm() {
    if (!buy) return;
    setBusy(true);
    const res = await purchasePackageAction({ packageId: buy.id });
    setBusy(false);
    if (res.ok) {
      toast({ tone: "success", title: `${buy.name} added`, description: "Pay at the venue; credits are ready to use when booking." });
      setBuy(null);
      router.refresh();
    } else toast({ tone: "danger", title: "The package was not bought", description: res.message });
  }

  return (
    <div className="space-y-6">
      <PageHeader back="/app/programs" eyebrow="Academy" title="Lesson packages" />
      {active.length ? (
        <div className="space-y-3">
          {active.map((p) => (
            <PurchaseCard key={p.id} purchase={p} />
          ))}
        </div>
      ) : (
        <Card variant="outline" padding="md" className="text-body-sm text-fg-muted">
          You have no active package. Credits cost less per lesson than booking one at a time, and come off automatically
          when you book a coach — there is nothing to redeem.
        </Card>
      )}

      <section>
        <SectionHeader eyebrow="Buy" title="Packages" />
        <div className="space-y-2.5">
          {catalog.map((c) => {
            const each = perLesson(c);
            const best = each === cheapest && catalog.length > 1;
            // The standing rate for the same lesson, where the package names a coach. Without one there is
            // nothing to compare against, so no saving is claimed.
            const rate = c.trainer?.hourlyRateCents ?? 0;
            const saving = rate > each ? rate - each : 0;
            return (
              <Card key={c.id} padding="none" variant={best ? "interactive" : "default"} className={cn("overflow-hidden", best && "border-volt/40")}>
                {best && <div className="bg-volt/15 px-4 py-1 text-[11px] font-bold uppercase tracking-wider text-volt">Lowest price per lesson</div>}
                <div className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-body font-bold">{c.name}</span>
                      <Badge size="sm">{count(c.credits, "lesson")}</Badge>
                    </div>
                    {c.description && <p className="mt-1 text-caption text-fg-muted">{c.description}</p>}
                    <div className="mt-2 flex items-baseline gap-1.5">
                      <span className="text-h3 tabular">{money(each, c.currency)}</span>
                      <span className="text-caption text-fg-muted">per lesson</span>
                      {saving > 0 && <span className="ml-1 text-caption font-semibold text-success">saves {money(saving, c.currency)} each</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-subtle">
                      <span className="inline-flex items-center gap-1 [&_svg]:size-3.5">
                        <CalendarClock /> Use within {c.validityDays} days
                      </span>
                      <span className="inline-flex items-center gap-1 [&_svg]:size-3.5">
                        <Users /> {c.trainer ? c.trainer.user.name : "Any coach"}
                      </span>
                      <span className="inline-flex items-center gap-1 [&_svg]:size-3.5">
                        <MapPin /> {c.location ? c.location.name.replace("HITTERS ", "") : "Any club"}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-body font-bold tabular">{money(c.priceCents, c.currency)}</div>
                    <Button size="sm" className="mt-1.5" variant={best ? "volt" : "primary"} onClick={() => setBuy(c)}>
                      Buy
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
          {catalog.length === 0 && <EmptyState compact icon={<Package />} title="No packages on sale" description="Ask reception about a custom package." />}
        </div>
      </section>

      {history.length > 0 && (
        <section>
          <SectionHeader eyebrow="Credits used" title="Lesson history" />
          <div className="space-y-1.5">
            {history.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-md border border-line/10 bg-surface-1 px-3 py-2 text-body-sm">
                <Receipt size={14} className="text-blue-300" />
                <span className="flex-1 truncate">
                  {formatInZone(new Date(r.lesson.startsAt), r.lesson.location.timezone)} · {r.lesson.trainer.user.name} · {r.purchase.name}
                </span>
                {r.refundedAt ? <Badge size="sm">Refunded</Badge> : <LessonStatusBadge status={r.lesson.status} size="sm" />}
              </div>
            ))}
          </div>
        </section>
      )}
      {purchases.filter((p) => p.status !== "ACTIVE").length > 0 && (
        <details className="text-caption text-fg-subtle">
          <summary className="cursor-pointer py-1">Past packages</summary>
          <div className="mt-2 space-y-2">
            {purchases.filter((p) => p.status !== "ACTIVE").map((p) => <PurchaseCard key={p.id} purchase={p} />)}
          </div>
        </details>
      )}
      <ConfirmDialog open={!!buy} onClose={() => setBuy(null)} title={buy ? `Buy ${buy.name}?` : ""} description={buy ? `${buy.credits} lesson credits for ${money(buy.priceCents, buy.currency)}, valid ${buy.validityDays} days. Pay at the venue; credits can be used right away.` : ""} confirmLabel="Buy package" loading={busy} onConfirm={confirm} />
    </div>
  );
}
