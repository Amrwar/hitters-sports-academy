"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Receipt } from "lucide-react";
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

export function PackagesView({ purchases, catalog }: { purchases: PurchaseView[]; catalog: PackageView[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [buy, setBuy] = useState<PackageView | null>(null);
  const [busy, setBusy] = useState(false);
  const active = purchases.filter((p) => p.status === "ACTIVE");
  const history = purchases.flatMap((p) => p.redemptions.map((r) => ({ ...r, purchase: p })));

  async function confirm() {
    if (!buy) return;
    setBusy(true);
    const res = await purchasePackageAction({ packageId: buy.id });
    setBusy(false);
    if (res.ok) {
      toast({ tone: "success", title: `${buy.name} added`, description: "Pay at the venue; credits are ready to use when booking." });
      setBuy(null);
      router.refresh();
    } else toast({ tone: "danger", title: "Could not buy", description: res.message });
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
          No active package. Prepaid credits are cheaper per lesson and are deducted automatically when you book a coach.
        </Card>
      )}

      <section>
        <SectionHeader eyebrow="Buy" title="Packages" />
        <div className="space-y-2">
          {catalog.map((c) => (
            <Card key={c.id} padding="md" className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-400/20">
                <Package size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-body font-bold">
                  {c.name}
                  <Badge size="sm">{count(c.credits, "credit")}</Badge>
                </div>
                <div className="text-caption text-fg-muted">
                  {money(Math.round(c.priceCents / c.credits), c.currency)} per lesson · valid {c.validityDays} days{c.trainer ? ` · ${c.trainer.user.name}` : ""}{c.location ? ` · ${c.location.name.replace("HITTERS ", "")}` : " · Any club"}
                </div>
              </div>
              <Button size="sm" onClick={() => setBuy(c)}>
                {money(c.priceCents, c.currency)}
              </Button>
            </Card>
          ))}
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
