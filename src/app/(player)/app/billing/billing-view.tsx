"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CreditCard, Receipt, Wallet } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Card, SectionHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { money } from "@/components/patterns/booking-status";
import { shortDate } from "@/lib/time";
import { count } from "@/lib/text";
import { cn } from "@/lib/cn";
import type { InvoiceStatus } from "@prisma/client";
import type { InvoiceView } from "@/server/services/invoices";
import type { CreditStatement } from "@/server/services/credits";
import { payWithCreditAction, startOnlinePaymentAction } from "@/server/actions/finance";

const TONE: Record<InvoiceStatus, "success" | "warning" | "neutral" | "info"> = { DRAFT: "neutral", ISSUED: "warning", PART_PAID: "warning", PAID: "success", VOID: "neutral", REFUNDED: "info" };
const LABEL: Record<InvoiceStatus, string> = { DRAFT: "Draft", ISSUED: "To pay", PART_PAID: "Part paid", PAID: "Paid", VOID: "Cancelled", REFUNDED: "Refunded" };

export function BillingView({ invoices, statement, onlineAvailable, allowCredit }: { invoices: InvoiceView[]; statement: CreditStatement; onlineAvailable: boolean; allowCredit: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const owed = invoices.filter((i) => i.amountDueCents > 0);
  const owedCents = owed.reduce((n, i) => n + i.amountDueCents, 0);
  const settled = invoices.filter((i) => i.amountDueCents === 0);

  async function payOnline(invoiceId: string) {
    setBusy(invoiceId);
    const res = await startOnlinePaymentAction(invoiceId, { portion: "FULL" });
    setBusy(null);
    if (!res.ok) return toast({ tone: "danger", title: "Payment could not be started", description: res.message });
    if (res.data.checkoutUrl) window.location.href = res.data.checkoutUrl;
  }

  async function payFromCredit(invoiceId: string) {
    setBusy(invoiceId);
    const res = await payWithCreditAction(invoiceId);
    setBusy(null);
    if (res.ok) {
      toast({ tone: "success", title: "Paid from your account" });
      router.refresh();
    } else toast({ tone: "danger", title: "That did not go through", description: res.message });
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Billing" title="Payments and receipts" />

      <Card variant={owedCents > 0 ? "brand" : "default"} padding="lg" className={owedCents > 0 ? "court-line" : undefined}>
        <div className="relative">
          <div className={cn("text-caption uppercase tracking-wider", owedCents > 0 ? "text-white/80" : "text-fg-subtle")}>{owedCents > 0 ? "To pay" : "Nothing owed"}</div>
          <div className="mt-1 text-display tabular">{money(owedCents)}</div>
          <div className={cn("mt-1 text-body-sm", owedCents > 0 ? "text-white/85" : "text-fg-muted")}>
            {owedCents > 0 ? `Across ${count(owed.length, "unpaid invoice")}. Pay at the club, or here if your club takes card.` : "Everything you have booked is settled."}
          </div>
          {statement.balanceCents > 0 && (
            <div className={cn("mt-4 flex items-center gap-2 rounded-md px-3 py-2 text-body-sm", owedCents > 0 ? "bg-white/15" : "bg-surface-2")}>
              <Wallet className="size-4" />
              <span>
                You have <span className="font-bold tabular">{money(statement.balanceCents)}</span> on your HITTERS account.
              </span>
            </div>
          )}
        </div>
      </Card>

      {owed.length > 0 && (
        <section>
          <SectionHeader eyebrow="Open" title="Still to pay" />
          <div className="space-y-3">
            {owed.map((inv) => (
              <Card key={inv.id} padding="md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/app/billing/${inv.number}`} className="text-body font-bold hover:underline">
                      {inv.lines[0]?.description ?? inv.number}
                    </Link>
                    <div className="mt-1 text-caption text-fg-muted">
                      {inv.number} · {shortDate(inv.createdAt)}
                      {inv.location ? ` · ${inv.location.name.replace("HITTERS ", "")}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-h4 tabular">{money(inv.amountDueCents, inv.currency)}</div>
                    <Badge tone={TONE[inv.status]} size="sm">
                      {LABEL[inv.status]}
                    </Badge>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-line/10 pt-3">
                  {onlineAvailable && (
                    <Button size="sm" leftIcon={<CreditCard />} loading={busy === inv.id} onClick={() => payOnline(inv.id)}>
                      Pay now
                    </Button>
                  )}
                  {allowCredit && statement.balanceCents > 0 && (
                    <Button size="sm" variant="secondary" leftIcon={<Wallet />} loading={busy === inv.id} onClick={() => payFromCredit(inv.id)}>
                      Use {money(Math.min(statement.balanceCents, inv.amountDueCents))} credit
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" href={`/app/billing/${inv.number}`}>
                    View
                  </Button>
                  {!onlineAvailable && <span className="self-center text-caption text-fg-subtle">Pay at the club.</span>}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {statement.entries.length > 0 && (
        <section>
          <SectionHeader eyebrow="Account" title="Your credit" action={<span className="text-body-sm font-bold tabular">{money(statement.balanceCents)}</span>} />
          <Card padding="none">
            <ul className="divide-y divide-line/10 text-body-sm">
              {statement.entries.slice(0, 8).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{e.reason ?? (e.kind === "SPEND" ? "Used on a booking" : "Credit")}</div>
                    <div className="text-caption text-fg-subtle">{shortDate(e.createdAt)}</div>
                  </div>
                  <span className={cn("shrink-0 tabular font-semibold", e.amountCents > 0 ? "text-success" : "text-fg-muted")}>
                    {e.amountCents > 0 ? "+" : "−"}
                    {money(Math.abs(e.amountCents))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section>
        <SectionHeader eyebrow="History" title="Receipts" />
        {settled.length === 0 ? (
          <EmptyState compact icon={<Receipt />} title="No receipts yet" description="Anything you pay for shows up here." />
        ) : (
          <div className="space-y-1.5">
            {settled.map((inv) => (
              <Link key={inv.id} href={`/app/billing/${inv.number}`} className="flex items-center gap-3 rounded-md border border-line/10 bg-surface-1 px-3 py-2.5 text-body-sm transition-colors hover:border-blue-400/40">
                <Receipt className="size-4 shrink-0 text-blue-300" />
                <span className="min-w-0 flex-1 truncate">{inv.lines[0]?.description ?? inv.number}</span>
                <span className="shrink-0 tabular text-fg-muted">{money(inv.totalCents, inv.currency)}</span>
                <Badge tone={TONE[inv.status]} size="sm">
                  {LABEL[inv.status]}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
