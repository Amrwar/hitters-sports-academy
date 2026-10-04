"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, TicketPercent } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/states";
import { TBody, TD, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { money } from "@/components/patterns/booking-status";
import { plainDate } from "@/lib/time";
import type { CouponView } from "@/server/services/coupons";
import { createCouponAction, updateCouponAction } from "@/server/actions/finance";

const SCOPES = [
  { value: "COURT", label: "Court hire" },
  { value: "LESSON", label: "Lessons" },
  { value: "PROGRAM", label: "Programs" },
  { value: "PACKAGE", label: "Packages" },
  { value: "MEMBERSHIP", label: "Memberships" },
];

export function CouponsView({ coupons }: { coupons: CouponView[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState<CouponView | null | "new">(null);
  const [busy, setBusy] = useState(false);

  async function save(form: FormData) {
    setBusy(true);
    const existing = editing === "new" ? null : editing;
    const kind = String(form.get("kind"));
    const rawValue = Number(form.get("value") ?? 0);
    const input = {
      code: String(form.get("code")),
      name: String(form.get("name")),
      kind,
      // A percentage is a whole number; a fixed amount is money, so it arrives in major units.
      value: kind === "PERCENT" ? Math.round(rawValue) : Math.round(rawValue * 100),
      maxDiscountCents: form.get("maxDiscount") ? Math.round(Number(form.get("maxDiscount")) * 100) : null,
      minSpendCents: form.get("minSpend") ? Math.round(Number(form.get("minSpend")) * 100) : null,
      appliesTo: SCOPES.filter((s) => form.get(`scope_${s.value}`) === "on").map((s) => s.value),
      validFrom: form.get("validFrom") ? new Date(String(form.get("validFrom"))) : null,
      validTo: form.get("validTo") ? new Date(String(form.get("validTo"))) : null,
      maxRedemptions: form.get("maxRedemptions") ? Number(form.get("maxRedemptions")) : null,
      maxPerPlayer: Number(form.get("maxPerPlayer") ?? 1),
      active: form.get("active") === "on",
    };
    const res = existing ? await updateCouponAction(existing.id, input) : await createCouponAction(input);
    setBusy(false);
    if (res.ok) {
      toast({ tone: "success", title: existing ? "Code updated" : "Code created" });
      setEditing(null);
      router.refresh();
    } else toast({ tone: "danger", title: "The code was not saved", description: res.message });
  }

  const value = (c: CouponView) => (c.kind === "PERCENT" ? `${c.value}% off` : `${money(c.value)} off`);

  return (
    <AdminShell
      title="Coupons"
      breadcrumb={["Money", "Coupons"]}
      actions={
        <Button leftIcon={<Plus />} onClick={() => setEditing("new")}>
          New code
        </Button>
      }
    >
      <Card padding="none">
        <CardHeader
          title="Discount codes"
          description="A code adds a line to an invoice rather than changing a price, so the receipt still shows what the thing cost and the finance screen can report what discounting costs."
          className="px-5 pt-5"
        />
        {coupons.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState icon={<TicketPercent />} title="No codes yet" description="Create one to run an offer." action={<Button onClick={() => setEditing("new")}>New code</Button>} />
          </div>
        ) : (
          <TableWrap className="rounded-none border-0 border-t">
            <Table>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>What it does</TH>
                  <TH>Applies to</TH>
                  <TH>Valid</TH>
                  <TH>Used</TH>
                  <TH className="text-right">Status</TH>
                </TR>
              </THead>
              <TBody>
                {coupons.map((c) => (
                  <TR key={c.id} interactive onClick={() => setEditing(c)}>
                    <TD className="whitespace-nowrap font-bold tabular">{c.code}</TD>
                    <TD>
                      <div className="font-semibold">{value(c)}</div>
                      <div className="text-caption text-fg-muted">{c.name}</div>
                    </TD>
                    <TD className="text-fg-muted">{c.appliesTo.length === 0 ? "Anything" : c.appliesTo.map((k) => SCOPES.find((s) => s.value === k)?.label ?? k).join(", ")}</TD>
                    <TD className="whitespace-nowrap text-fg-muted">{c.validTo ? `to ${plainDate(c.validTo)}` : "No end date"}</TD>
                    <TD className="tabular text-fg-muted">
                      {c.redemptionCount}
                      {c.maxRedemptions ? ` of ${c.maxRedemptions}` : ""}
                    </TD>
                    <TD className="text-right">
                      <Badge tone={c.active ? "success" : "neutral"} dot>
                        {c.active ? "Live" : "Off"}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New code" : "Edit code"} description="Limits are checked when the code is applied, not when it is created.">
        <form className="space-y-3 pb-2" action={save} key={editing === "new" ? "new" : (editing?.id ?? "none")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Code" hint="Letters, numbers and dashes.">{(id) => <Input id={id} name="code" defaultValue={editing !== "new" ? editing?.code : ""} required maxLength={40} className="uppercase" />}</Field>
            <Field label="Name" hint="Shown on the invoice line.">{(id) => <Input id={id} name="name" defaultValue={editing !== "new" ? editing?.name : ""} required maxLength={120} />}</Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Kind">{(id) => <Select id={id} name="kind" defaultValue={editing !== "new" ? (editing?.kind ?? "PERCENT") : "PERCENT"} options={[{ value: "PERCENT", label: "Percentage" }, { value: "FIXED", label: "Fixed amount" }]} />}</Field>
            <Field label="Value" hint="Percent, or an amount.">
              {(id) => <Input id={id} name="value" type="number" step="0.01" min="1" defaultValue={editing !== "new" && editing ? (editing.kind === "PERCENT" ? editing.value : (editing.value / 100).toFixed(2)) : ""} required />}
            </Field>
            <Field label="Cap" hint="Most a percentage may take off.">
              {(id) => <Input id={id} name="maxDiscount" type="number" step="0.01" min="0" defaultValue={editing !== "new" && editing?.maxDiscountCents ? (editing.maxDiscountCents / 100).toFixed(2) : ""} />}
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Minimum spend">{(id) => <Input id={id} name="minSpend" type="number" step="0.01" min="0" defaultValue={editing !== "new" && editing?.minSpendCents ? (editing.minSpendCents / 100).toFixed(2) : ""} />}</Field>
            <Field label="Total uses" hint="Empty for unlimited.">{(id) => <Input id={id} name="maxRedemptions" type="number" min="1" defaultValue={editing !== "new" ? (editing?.maxRedemptions ?? "") : ""} />}</Field>
            <Field label="Uses per player">{(id) => <Input id={id} name="maxPerPlayer" type="number" min="1" max="1000" defaultValue={editing !== "new" ? (editing?.maxPerPlayer ?? 1) : 1} />}</Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Valid from">{(id) => <Input id={id} name="validFrom" type="date" defaultValue={editing !== "new" && editing?.validFrom ? editing.validFrom.toISOString().slice(0, 10) : ""} />}</Field>
            <Field label="Valid to">{(id) => <Input id={id} name="validTo" type="date" defaultValue={editing !== "new" && editing?.validTo ? editing.validTo.toISOString().slice(0, 10) : ""} />}</Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-body-sm font-semibold">Applies to</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {SCOPES.map((s) => (
                <label key={s.value} className="flex items-center gap-2 text-body-sm text-fg-muted">
                  <input type="checkbox" name={`scope_${s.value}`} defaultChecked={editing !== "new" && !!editing?.appliesTo.includes(s.value as never)} className="size-4 rounded border-line/30" />
                  {s.label}
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-caption text-fg-subtle">Tick nothing to let it apply to everything on an invoice.</p>
          </fieldset>
          <label className="flex items-center gap-2 text-body-sm">
            <input type="checkbox" name="active" defaultChecked={editing === "new" ? true : (editing?.active ?? true)} className="size-4 rounded border-line/30" />
            Live
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" type="button" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save code
            </Button>
          </div>
        </form>
      </Modal>
    </AdminShell>
  );
}
