"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Ban, Banknote, RotateCcw, Ticket } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { money } from "@/components/patterns/booking-status";
import { shortDate } from "@/lib/time";
import { cn } from "@/lib/cn";
import type { InvoiceView } from "@/server/services/invoices";
import { applyCouponAction, refundAction, removeCouponAction, takePaymentAction, voidInvoiceAction } from "@/server/actions/finance";
import { INVOICE_LABEL, INVOICE_TONE } from "../invoices-view";

type Movement = { at: Date; kind: string; description: string; amountCents: number; by: string | null };

export function InvoiceDetail({ invoice, ledger, canRefund }: { invoice: InvoiceView; ledger: Movement[]; canRefund: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState(false);
  const [refund, setRefund] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [couponCode, setCouponCode] = useState("");

  const due = invoice.amountDueCents;
  const paid = invoice.paidCents - invoice.refundedCents;
  const who = invoice.player?.name ?? invoice.guestName ?? "Guest";

  async function act(label: string, fn: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.ok) {
      toast({ tone: "success", title: label });
      setPay(false);
      setRefund(false);
      setVoiding(false);
      setCouponCode("");
      router.refresh();
    } else toast({ tone: "danger", title: "That did not go through", description: res.message });
  }

  return (
    <AdminShell
      title={invoice.number}
      breadcrumb={["Money", "Invoices", invoice.number]}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {due > 0 && invoice.status !== "VOID" && (
            <Button leftIcon={<Banknote />} onClick={() => setPay(true)}>
              Take {money(due, invoice.currency)}
            </Button>
          )}
          {canRefund && paid > 0 && (
            <Button variant="secondary" leftIcon={<RotateCcw />} onClick={() => setRefund(true)}>
              Refund
            </Button>
          )}
          {paid === 0 && invoice.status !== "VOID" && (
            <Button variant="ghost" leftIcon={<Ban />} className="text-danger hover:bg-danger/10 hover:text-danger" onClick={() => setVoiding(true)}>
              Void
            </Button>
          )}
        </div>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card padding="none">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line/10 p-5">
            <div>
              <div className="text-overline uppercase text-blue-400">Invoice</div>
              <div className="text-h2 tabular">{invoice.number}</div>
              <div className="mt-1 text-body-sm text-fg-muted">
                {who}
                {invoice.location ? ` · ${invoice.location.name}` : ""} · raised {shortDate(invoice.createdAt)}
              </div>
            </div>
            <Badge tone={INVOICE_TONE[invoice.status]} dot size="md">
              {INVOICE_LABEL[invoice.status]}
            </Badge>
          </div>

          {/* The lines are the receipt. Negative ones are shown as they are, because a discount that
              reads as a charge is how a player ends up at the desk asking what they were billed for. */}
          <ul className="divide-y divide-line/10 px-5 text-body-sm">
            {invoice.lines.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-4 py-3">
                <span className={cn("min-w-0 flex-1", l.amountCents < 0 ? "text-fg-muted" : "font-semibold")}>
                  {l.description}
                  {l.quantity > 1 && <span className="ml-1.5 text-fg-subtle">× {l.quantity}</span>}
                </span>
                <span className={cn("shrink-0 tabular font-semibold", l.amountCents < 0 && "text-success")}>{money(l.amountCents, invoice.currency)}</span>
              </li>
            ))}
          </ul>

          <dl className="space-y-1.5 border-t border-line/10 p-5 text-body-sm">
            {invoice.discountCents > 0 && (
              <Row label="Discount" value={`−${money(invoice.discountCents, invoice.currency)}`} tone="success" />
            )}
            {invoice.creditCents > 0 && <Row label="Credit applied" value={`−${money(invoice.creditCents, invoice.currency)}`} tone="success" />}
            <Row label="Total" value={money(invoice.totalCents, invoice.currency)} strong />
            {invoice.paidCents > 0 && <Row label="Paid" value={money(invoice.paidCents, invoice.currency)} />}
            {invoice.refundedCents > 0 && <Row label="Refunded" value={`−${money(invoice.refundedCents, invoice.currency)}`} tone="success" />}
            <div className="flex items-center justify-between border-t border-line/10 pt-2.5">
              <dt className="font-bold">{due > 0 ? "Still to pay" : "Settled"}</dt>
              <dd className={cn("text-h4 tabular", due > 0 ? "text-warning" : "text-success")}>{money(due, invoice.currency)}</dd>
            </div>
          </dl>

          {invoice.voidReason && <p className="border-t border-line/10 px-5 py-3 text-body-sm text-fg-muted">Voided: {invoice.voidReason}</p>}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="What happened" description="Every movement against this invoice, oldest first." />
            <ol className="space-y-3">
              {ledger.map((m, i) => (
                <li key={`${m.kind}-${i}`} className="flex items-start gap-3 text-body-sm">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", m.kind === "Refund" ? "bg-warning" : m.kind === "Invoice" ? "bg-line/40" : "bg-success")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{m.kind}</span>
                      <span className={cn("tabular", m.amountCents < 0 && "text-warning")}>{money(m.amountCents, invoice.currency)}</span>
                    </div>
                    <div className="text-caption text-fg-muted">
                      {m.description} · {shortDate(m.at)}
                      {m.by ? ` · ${m.by}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          {due > 0 && invoice.status !== "VOID" && (
            <Card>
              <CardHeader title="Discount code" description={invoice.coupon ? "One code per invoice." : "Applies before payment only."} />
              {invoice.coupon ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{invoice.coupon.code}</div>
                    <div className="text-caption text-fg-muted">{invoice.coupon.name}</div>
                  </div>
                  <Button size="sm" variant="ghost" loading={busy} onClick={() => act("Code removed", () => removeCouponAction(invoice.id))}>
                    Remove
                  </Button>
                </div>
              ) : (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act("Code applied", () => applyCouponAction(invoice.id, couponCode));
                  }}
                >
                  <Input className="flex-1" placeholder="SAVE20" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} leading={<Ticket />} />
                  <Button type="submit" variant="secondary" loading={busy} disabled={couponCode.length < 3}>
                    Apply
                  </Button>
                </form>
              )}
            </Card>
          )}

          {invoice.bookingId && (
            <Card padding="sm" className="px-4 text-body-sm">
              <Link href={`/admin/bookings/${invoice.bookingId}`} className="font-semibold text-blue-500 hover:underline">
                Open the booking this is for
              </Link>
            </Card>
          )}
        </div>
      </div>

      <Modal open={pay} onClose={() => setPay(false)} title="Take payment" description={`${who} owes ${money(due, invoice.currency)} on ${invoice.number}.`}>
        <form
          className="space-y-3 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const amount = String(f.get("amountCents") ?? "");
            void act("Payment recorded", () =>
              takePaymentAction(invoice.id, {
                method: String(f.get("method")),
                amountCents: amount ? Math.round(Number(amount) * 100) : undefined,
                reference: String(f.get("reference") ?? ""),
                waive: f.get("waive") === "on",
              }),
            );
          }}
        >
          <Field label="How">{(id) => <Select id={id} name="method" defaultValue="CASH" options={[{ value: "CASH", label: "Cash" }, { value: "CARD", label: "Card machine" }, { value: "TRANSFER", label: "Bank transfer" }, { value: "WALLET", label: "Mobile wallet" }]} />}</Field>
          <Field label="Amount" hint={`Leave empty to settle the whole ${money(due, invoice.currency)}.`}>
            {(id) => <Input id={id} name="amountCents" type="number" step="0.01" min="0" placeholder={(due / 100).toFixed(2)} />}
          </Field>
          <Field label="Reference" hint="A till slip or transfer reference, if there is one.">{(id) => <Input id={id} name="reference" maxLength={120} />}</Field>
          <label className="flex items-center gap-2 text-body-sm text-fg-muted">
            <input type="checkbox" name="waive" className="size-4 rounded border-line/30" />
            Write this off instead of collecting it
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" type="button" onClick={() => setPay(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Record payment
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={refund} onClose={() => setRefund(false)} title="Refund" description={`${money(paid, invoice.currency)} was taken on ${invoice.number}.`}>
        <form
          className="space-y-3 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const amount = String(f.get("amountCents") ?? "");
            void act("Refund issued", () =>
              refundAction(invoice.id, {
                amountCents: amount ? Math.round(Number(amount) * 100) : undefined,
                destination: String(f.get("destination")),
                reason: String(f.get("reason") ?? ""),
              }),
            );
          }}
        >
          <Field label="Amount" hint={`Leave empty to refund the whole ${money(paid, invoice.currency)}.`}>
            {(id) => <Input id={id} name="amountCents" type="number" step="0.01" min="0" max={(paid / 100).toFixed(2)} placeholder={(paid / 100).toFixed(2)} />}
          </Field>
          <Field label="Where it goes" hint="Back to the card only works when the money came in through a gateway.">
            {(id) => <Select id={id} name="destination" defaultValue="ORIGINAL" options={[{ value: "ORIGINAL", label: "Back the way it came" }, { value: "CREDIT", label: "To the member's account credit" }, { value: "CASH", label: "Cash at the club" }]} />}
          </Field>
          <Field label="Reason" hint="The player sees this.">{(id) => <Textarea id={id} name="reason" rows={2} maxLength={300} />}</Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" type="button" onClick={() => setRefund(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={busy}>
              Refund
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={voiding}
        onClose={() => setVoiding(false)}
        title="Void this invoice?"
        description="Nothing will be owed and the invoice stays on record as voided. This cannot be undone."
        confirmLabel="Void"
        tone="danger"
        loading={busy}
        onConfirm={() => act("Invoice voided", () => voidInvoiceAction(invoice.id, "Voided by staff"))}
      />
    </AdminShell>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "success" }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={strong ? "font-bold" : "text-fg-muted"}>{label}</dt>
      <dd className={cn("tabular", strong && "font-bold", tone === "success" && "text-success")}>{value}</dd>
    </div>
  );
}
