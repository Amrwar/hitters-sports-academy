"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Receipt, Search } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/states";
import { TBody, TD, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { money } from "@/components/patterns/booking-status";
import { shortDate } from "@/lib/time";
import { count } from "@/lib/text";
import type { InvoiceStatus } from "@prisma/client";
import type { InvoiceView } from "@/server/services/invoices";

export const INVOICE_TONE: Record<InvoiceStatus, "success" | "warning" | "danger" | "neutral" | "info"> = {
  DRAFT: "neutral",
  ISSUED: "warning",
  PART_PAID: "warning",
  PAID: "success",
  VOID: "neutral",
  REFUNDED: "info",
};

export const INVOICE_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  ISSUED: "Unpaid",
  PART_PAID: "Part paid",
  PAID: "Paid",
  VOID: "Void",
  REFUNDED: "Refunded",
};

const FILTERS = [
  { value: "", label: "All" },
  { value: "outstanding", label: "Owed" },
  { value: "PAID", label: "Paid" },
  { value: "REFUNDED", label: "Refunded" },
  { value: "VOID", label: "Void" },
];

export function InvoicesView({ rows, total, filter, q }: { rows: InvoiceView[]; total: number; filter: string; q: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(q);
  const [, startTransition] = useTransition();

  const go = (next: Record<string, string | undefined>) => {
    const query = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) query.set(k, v);
      else query.delete(k);
    }
    startTransition(() => router.push(`/admin/finance/invoices?${query.toString()}`));
  };

  return (
    <AdminShell title="Invoices" breadcrumb={["Money", "Invoices"]}>
      <Card padding="md" className="mb-5">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: search || undefined });
          }}
        >
          <Input className="flex-1" placeholder="Invoice number, member or guest" value={search} onChange={(e) => setSearch(e.target.value)} leading={<Search />} />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        <div className="mt-3">
          <Tabs variant="pill" value={filter} onChange={(v) => go({ status: v === "outstanding" ? undefined : v || undefined, outstanding: v === "outstanding" ? "1" : undefined })} items={FILTERS} />
        </div>
      </Card>

      <Card padding="none">
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<Receipt />} title="No invoices match" description="Change the filter or search for a different member." />
          </div>
        ) : (
          <>
            <TableWrap className="rounded-none border-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Invoice</TH>
                    <TH>Who</TH>
                    <TH>For</TH>
                    <TH>Raised</TH>
                    <TH>Status</TH>
                    <TH>Total</TH>
                    <TH className="text-right">Owed</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((inv) => (
                    <TR key={inv.id}>
                      <TD className="whitespace-nowrap font-semibold tabular">
                        <Link href={`/admin/finance/invoices/${inv.number}`} className="text-blue-500 hover:underline">
                          {inv.number}
                        </Link>
                      </TD>
                      <TD className="font-semibold">{inv.player?.name ?? inv.guestName ?? "Guest"}</TD>
                      <TD className="max-w-[22rem] truncate text-fg-muted">{inv.lines[0]?.description ?? "—"}</TD>
                      <TD className="whitespace-nowrap text-fg-muted">{shortDate(inv.createdAt)}</TD>
                      <TD>
                        <Badge tone={INVOICE_TONE[inv.status]} dot>
                          {INVOICE_LABEL[inv.status]}
                        </Badge>
                      </TD>
                      <TD numeric className="text-fg-muted">
                        {money(inv.totalCents, inv.currency)}
                      </TD>
                      <TD numeric className={inv.amountDueCents > 0 ? "font-bold text-warning" : "text-fg-subtle"}>
                        {inv.amountDueCents > 0 ? money(inv.amountDueCents, inv.currency) : "—"}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
            <div className="border-t border-line/10 px-5 py-3 text-center text-body-sm text-fg-muted">
              Showing {count(rows.length, "invoice")} of {total.toLocaleString("en")}.
            </div>
          </>
        )}
      </Card>
    </AdminShell>
  );
}
