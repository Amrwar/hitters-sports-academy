"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Ticket, Wallet } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StickyBar } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { money } from "@/components/patterns/booking-status";
import { shortDate } from "@/lib/time";
import { cn } from "@/lib/cn";
import type { InvoiceStatus } from "@prisma/client";
import type { InvoiceView } from "@/server/services/invoices";
import { applyCouponAction, payWithCreditAction, startOnlinePaymentAction } from "@/server/actions/finance";

const TONE: Record<InvoiceStatus, "success" | "warning" | "neutral" | "info"> = { DRAFT: "neutral", ISSUED: "warning", PART_PAID: "warning", PAID: "success", VOID: "neutral", REFUNDED: "info" };
const LABEL: Record<InvoiceStatus, string> = { DRAFT: "Draft", ISSUED: "To pay", PART_PAID: "Part paid", PAID: "Paid", VOID: "Cancelled", REFUNDED: "Refunded" };

export function ReceiptView({ invoice, creditCents, onlineAvailable, allowCredit }: { invoice: InvoiceView; creditCents: number; onlineAvailable: boolean; allowCredit: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const due = invoice.amountDueCents;

  async function payOnline() {
    setBusy(true);
    const res = await startOnlinePaymentAction(invoice.id, { portion: "FULL" });
    setBusy(false);
    if (!res.ok) return toast({ tone: "danger", title: "Payment could not be started", description: res.message });
    if (res.data.checkoutUrl) window.location.href = res.data.checkoutUrl;
  }

  async function act(label: string, fn: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.ok) {
      toast({ tone: "success", title: label });
      setCode("");
      router.refresh();
    } else toast({ tone: "danger", title: "That did not go through", description: res.message });
  }

  return (
    <div className={cn("space-y-5", due > 0 && "pb-28")}>
      <PageHeader back="/app/billing" eyebrow={invoice.number} title={due > 0 ? "To pay" : "Receipt"} action={<Badge tone={TONE[invoice.status]} dot size="md">{LABEL[invoice.status]}</Badge>} />

      <Card padding="none">
        <div className="border-b border-line/10 px-4 py-3 text-caption text-fg-muted">
          Raised {shortDate(invoice.createdAt)}
          {invoice.location ? ` · ${invoice.location.name}` : ""}
        </div>
        <ul className="divide-y divide-line/10 px-4 text-body-sm">
          {invoice.lines.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-3 py-3">
              <span className={cn("min-w-0 flex-1", l.amountCents < 0 ? "text-fg-muted" : "font-semibold")}>{l.description}</span>
              <span className={cn("shrink-0 tabular font-semibold", l.amountCents < 0 && "text-success")}>{money(l.amountCents, invoice.currency)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-1.5 border-t border-line/10 px-4 py-3.5 text-body-sm">
          <div className="flex items-center justify-between">
            <dt className="font-bold">Total</dt>
            <dd className="font-bold tabular">{money(invoice.totalCents, invoice.currency)}</dd>
          </div>
          {invoice.paidCents > 0 && (
            <div className="flex items-center justify-between text-fg-muted">
              <dt>Paid</dt>
              <dd className="tabular">{money(invoice.paidCents, invoice.currency)}</dd>
            </div>
          )}
          {invoice.refundedCents > 0 && (
            <div className="flex items-center justify-between text-success">
              <dt>Refunded</dt>
              <dd className="tabular">−{money(invoice.refundedCents, invoice.currency)}</dd>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-line/10 pt-2">
            <dt className="font-bold">{due > 0 ? "Still to pay" : "Settled"}</dt>
            <dd className={cn("text-h4 tabular", due > 0 ? "text-warning" : "text-success")}>{money(due, invoice.currency)}</dd>
          </div>
        </dl>
      </Card>

      {invoice.payments.filter((p) => p.status !== "CANCELLED" && p.status !== "PENDING").length > 0 && (
        <Card padding="sm">
          <div className="px-1 pb-2 text-caption font-bold uppercase tracking-wider text-fg-subtle">Payments</div>
          <ul className="divide-y divide-line/10 text-body-sm">
            {invoice.payments
              .filter((p) => p.status !== "CANCELLED" && p.status !== "PENDING")
              .map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-1 py-2">
                  <span className="text-fg-muted">
                    {p.method === "CREDIT" ? "From your account" : p.method === "NONE" ? "Written off by the club" : p.method.charAt(0) + p.method.slice(1).toLowerCase()}
                    {p.paidAt ? ` · ${shortDate(p.paidAt)}` : ""}
                  </span>
                  <span className="tabular font-semibold">{money(p.amountCents, invoice.currency)}</span>
                </li>
              ))}
          </ul>
        </Card>
      )}

      {due > 0 && !invoice.coupon && (
        <Card padding="md">
          <div className="mb-2 text-body-sm font-semibold">Have a code?</div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void act("Code applied", () => applyCouponAction(invoice.id, code));
            }}
          >
            <Input className="flex-1" placeholder="SAVE20" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} leading={<Ticket />} />
            <Button type="submit" variant="secondary" loading={busy} disabled={code.length < 3}>
              Apply
            </Button>
          </form>
        </Card>
      )}

      {due > 0 && (
        <StickyBar>
          <Card variant="brand" padding="sm" className="shadow-lg backdrop-blur-xl">
            <div className="relative flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-caption text-white/80">{onlineAvailable ? "Pay now, or at the club" : "Pay at the club"}</div>
                <div className="truncate text-h4 tabular">{money(due, invoice.currency)}</div>
              </div>
              <div className="flex shrink-0 gap-2">
                {allowCredit && creditCents > 0 && (
                  <Button size="lg" variant="secondary" className="border-transparent bg-white text-blue-700 hover:bg-blue-50" leftIcon={<Wallet />} loading={busy} onClick={() => act("Paid from your account", () => payWithCreditAction(invoice.id))}>
                    Credit
                  </Button>
                )}
                {onlineAvailable && (
                  <Button size="lg" variant="volt" leftIcon={<CreditCard />} loading={busy} onClick={payOnline}>
                    Pay
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </StickyBar>
      )}
    </div>
  );
}
