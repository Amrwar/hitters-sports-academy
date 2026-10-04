"use client";

import Link from "next/link";
import { AlertTriangle, BadgeCheck, Package, Receipt, RotateCcw, Wallet } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { TBody, TD, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { money } from "@/components/patterns/booking-status";
import { count } from "@/lib/text";
import { shortDate } from "@/lib/time";
import { cn } from "@/lib/cn";
import type { FinanceReport } from "@/server/services/finance";

const RANGES = [4, 8, 12, 26];

function delta(now: number, before: number): { value: string; positive: boolean } | undefined {
  if (!before) return undefined;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return { value: "no change", positive: true };
  return { value: `${pct > 0 ? "+" : ""}${pct}% vs previous`, positive: pct > 0 };
}

/**
 * Two series on one axis: what was billed, and what came in.
 *
 * Deliberately paired rather than shown on two charts. The gap between them is the whole story of a
 * club's cash position, and two charts side by side make it something the reader has to work out.
 */
function PairedBars({ invoiced, collected }: { invoiced: { label: string; value: number }[]; collected: { label: string; value: number }[] }) {
  const max = Math.max(1, ...invoiced.map((p) => p.value), ...collected.map((p) => p.value));
  const empty = max === 1;
  if (empty) return <p className="flex h-48 items-center justify-center text-body-sm text-fg-muted">Nothing invoiced in this period yet.</p>;
  const thousands = (cents: number) => (cents ? `${Math.round(cents / 100_000)}k` : "");
  return (
    <div className="flex h-48 items-end gap-2">
      {invoiced.map((p, i) => (
        <div key={p.label} className="flex h-full flex-1 flex-col items-center gap-2" title={`${p.label}: invoiced ${money(p.value)}, collected ${money(collected[i]?.value ?? 0)}`}>
          <span className="text-caption font-semibold tabular text-fg-muted">{thousands(p.value)}</span>
          <div className="flex w-full flex-1 items-end gap-0.5 border-b border-line/15">
            <div className={cn("w-1/2 rounded-t-xs", p.value === 0 ? "bg-line/10" : "bg-brand/35")} style={{ height: p.value === 0 ? "2px" : `${Math.max(4, (p.value / max) * 100)}%` }} />
            <div className={cn("w-1/2 rounded-t-xs", (collected[i]?.value ?? 0) === 0 ? "bg-line/10" : "bg-brand-gradient")} style={{ height: (collected[i]?.value ?? 0) === 0 ? "2px" : `${Math.max(4, ((collected[i]?.value ?? 0) / max) * 100)}%` }} />
          </div>
          <span className="text-caption font-semibold text-fg-subtle">{p.label}</span>
        </div>
      ))}
    </div>
  );
}

export function FinanceView({ report, weeks, locationId }: { report: FinanceReport; weeks: number; locationId?: string }) {
  const { totals, previous, memberships, packages } = report;
  const href = (w: number) => ({ pathname: "/admin/finance", query: { weeks: String(w), ...(locationId ? { location: locationId } : {}) } });

  return (
    <AdminShell
      title="Finance"
      breadcrumb={["Money", "Finance"]}
      actions={
        <div className="flex items-center gap-1 rounded-full border border-line/10 bg-surface-2 p-1">
          {RANGES.map((w) => (
            <Link key={w} href={href(w)} className={cn("rounded-full px-3 py-1.5 text-body-sm font-semibold transition-colors", w === weeks ? "bg-brand-gradient text-white shadow-glow-sm" : "text-fg-muted hover:text-fg")}>
              {w}w
            </Link>
          ))}
        </div>
      }
    >
      <p className="mb-5 text-body-sm text-fg-muted">
        The last {count(weeks, "week")} across {count(report.scope.locations, "club")}. Invoiced is what was billed, collected is what arrived, outstanding is the difference. Nothing is estimated.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile size="lg" label="Collected" value={money(totals.collectedCents)} icon={<Wallet />} tone="brand" delta={delta(totals.collectedCents, previous.collectedCents)} />
        <StatTile size="lg" label="Invoiced" value={money(totals.invoicedCents)} icon={<Receipt />} delta={delta(totals.invoicedCents, previous.invoicedCents)} />
        <StatTile size="lg" label="Outstanding" value={money(totals.outstandingCents)} icon={<AlertTriangle />} delta={{ value: `${count(totals.outstandingInvoices, "invoice")} unpaid`, positive: totals.outstandingInvoices === 0 }} />
        <StatTile size="lg" label="Refunded" value={money(totals.refundedCents)} icon={<RotateCcw />} delta={delta(totals.refundedCents, previous.refundedCents)} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title="Invoiced and collected, by week"
            description="The pale bar is what was billed; the solid one is what came in."
            action={<Badge tone={totals.outstandingCents === 0 ? "success" : "warning"}>{money(totals.netCents)} net</Badge>}
          />
          <PairedBars invoiced={report.invoicedByWeek} collected={report.collectedByWeek} />
        </Card>

        <Card>
          <CardHeader title="How people paid" description="Every payment taken in this period." />
          {report.byMethod.length === 0 ? (
            <p className="py-8 text-center text-body-sm text-fg-muted">No payments yet.</p>
          ) : (
            <ul className="space-y-3.5">
              {report.byMethod.map((m) => {
                const pct = totals.collectedCents ? Math.round((m.amountCents / totals.collectedCents) * 100) : 0;
                return (
                  <li key={m.method}>
                    <div className="mb-1.5 flex items-center justify-between text-body-sm">
                      <span className="font-semibold">{m.label}</span>
                      <span className="tabular text-fg-muted">
                        {money(m.amountCents)} · {count(m.count, "payment")}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-line/10">
                      <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${Math.max(2, pct)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="What the money was for" description="Invoiced in this period, by line." />
          {report.byKind.length === 0 ? (
            <p className="py-8 text-center text-body-sm text-fg-muted">Nothing invoiced yet.</p>
          ) : (
            <ul className="divide-y divide-line/10 text-body-sm">
              {report.byKind.map((k) => (
                <li key={k.kind} className="flex items-center justify-between py-2.5">
                  <span className={k.amountCents < 0 ? "text-fg-muted" : "font-semibold"}>{k.label}</span>
                  <span className={cn("tabular font-semibold", k.amountCents < 0 && "text-success")}>{money(k.amountCents)}</span>
                </li>
              ))}
              {totals.discountCents > 0 && (
                <li className="flex items-center justify-between py-2.5 text-caption text-fg-subtle">
                  <span>Discounting cost the academy</span>
                  <span className="tabular">{money(totals.discountCents)}</span>
                </li>
              )}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Memberships and packages" description="Recurring income and what is still owed in kind." />
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Active members" value={memberships.active} icon={<BadgeCheck />} delta={memberships.pending ? { value: `${memberships.pending} awaiting payment`, positive: false } : undefined} />
            <StatTile label="Per month" value={money(memberships.recurringCents)} />
            <StatTile label="Packages sold" value={packages.sold} icon={<Package />} delta={{ value: money(packages.revenueCents) }} />
            <StatTile label="Credits owed" value={packages.creditsOutstanding} delta={{ value: "lessons", positive: true }} />
          </div>
          {memberships.expiringSoon > 0 && <p className="mt-4 text-body-sm text-warning">{count(memberships.expiringSoon, "membership")} ends within 30 days and will not renew.</p>}
          {totals.creditLiabilityCents > 0 && <p className="mt-2 text-body-sm text-fg-muted">The academy holds {money(totals.creditLiabilityCents)} of member credit, which is a liability, not income.</p>}
        </Card>
      </div>

      <Card padding="none" className="mt-5">
        <CardHeader
          title="Owed to the academy"
          description={totals.outstandingInvoices ? "Oldest first, which is the order to chase them in." : "Nothing outstanding."}
          className="px-5 pt-5"
          action={
            <Link href="/admin/finance/invoices?outstanding=1" className="text-body-sm font-semibold text-blue-400 hover:underline">
              All invoices
            </Link>
          }
        />
        {report.outstanding.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState compact icon={<Receipt />} title="Everything is paid" description="No invoice has a balance on it." />
          </div>
        ) : (
          <TableWrap className="rounded-none border-0 border-t">
            <Table>
              <THead>
                <TR>
                  <TH>Invoice</TH>
                  <TH>Who</TH>
                  <TH>Club</TH>
                  <TH>Raised</TH>
                  <TH>Total</TH>
                  <TH className="text-right">Owed</TH>
                </TR>
              </THead>
              <TBody>
                {report.outstanding.map((o) => (
                  <TR key={o.id}>
                    <TD className="whitespace-nowrap font-semibold tabular">
                      <Link href={`/admin/finance/invoices/${o.number}`} className="text-blue-500 hover:underline">
                        {o.number}
                      </Link>
                    </TD>
                    <TD className="font-semibold">{o.who}</TD>
                    <TD className="text-fg-muted">{o.locationName?.replace("HITTERS ", "") ?? "—"}</TD>
                    <TD className="whitespace-nowrap text-fg-muted">{shortDate(o.createdAt)}</TD>
                    <TD numeric className="text-fg-muted">
                      {money(o.totalCents)}
                    </TD>
                    <TD numeric className="font-bold text-warning">
                      {money(o.dueCents)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <Card padding="none">
          <CardHeader title="Recent refunds" description="Every refund that settled, newest first." className="px-5 pt-5" />
          {report.refunds.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState compact icon={<RotateCcw />} title="No refunds" description="Nothing has been given back." />
            </div>
          ) : (
            <TableWrap className="rounded-none border-0 border-t">
              <Table>
                <THead>
                  <TR>
                    <TH>Invoice</TH>
                    <TH>Who</TH>
                    <TH>Where it went</TH>
                    <TH className="text-right">Amount</TH>
                  </TR>
                </THead>
                <TBody>
                  {report.refunds.map((r) => (
                    <TR key={r.id}>
                      <TD className="whitespace-nowrap tabular">
                        <Link href={`/admin/finance/invoices/${r.number}`} className="text-blue-500 hover:underline">
                          {r.number}
                        </Link>
                      </TD>
                      <TD className="font-semibold">{r.who}</TD>
                      <TD className="text-fg-muted">{r.destination === "CREDIT" ? "Account credit" : r.destination === "CASH" ? "Cash at the club" : "Back to the card"}</TD>
                      <TD numeric className="font-semibold">
                        {money(r.amountCents)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </Card>

        <Card padding="none">
          <CardHeader title="By club" description="Where the money came from." className="px-5 pt-5" />
          <TableWrap className="rounded-none border-0 border-t">
            <Table>
              <THead>
                <TR>
                  <TH>Club</TH>
                  <TH>Invoiced</TH>
                  <TH>Collected</TH>
                  <TH className="text-right">Outstanding</TH>
                </TR>
              </THead>
              <TBody>
                {report.byLocation.map((l) => (
                  <TR key={l.id}>
                    <TD className="font-semibold">{l.name}</TD>
                    <TD numeric className="text-fg-muted">
                      {money(l.invoicedCents)}
                    </TD>
                    <TD numeric className="font-semibold">
                      {money(l.collectedCents)}
                    </TD>
                    <TD numeric className={l.outstandingCents > 0 ? "font-semibold text-warning" : "text-fg-muted"}>
                      {money(l.outstandingCents)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </Card>
      </div>

      {/* Not decoration: a club needs to know whether online payment is actually available before it
          promises it to a player. */}
      <Card className="mt-5" padding="md">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-body-sm">
          <span className="font-semibold">Payment providers</span>
          {report.providers.map((p) => (
            <span key={p.key} className="inline-flex items-center gap-2 text-fg-muted">
              <span className={cn("size-2 rounded-full", p.configured ? "bg-success" : "bg-line/30")} />
              {p.label}
              {!p.online && <span className="text-fg-subtle">· always available</span>}
              {p.online && !p.configured && <span className="text-fg-subtle">· not configured</span>}
            </span>
          ))}
        </div>
      </Card>
    </AdminShell>
  );
}
