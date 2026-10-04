"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BadgeCheck, Plus } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/states";
import { TBody, TD, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { money } from "@/components/patterns/booking-status";
import { plainDate } from "@/lib/time";
import { count } from "@/lib/text";
import type { MembershipTermStatus } from "@prisma/client";
import type { MembershipView, PlanView } from "@/server/services/memberships";
import { upsertMembershipPlanAction } from "@/server/actions/finance";

const TERM_TONE: Record<MembershipTermStatus, "success" | "warning" | "neutral" | "danger"> = { ACTIVE: "success", PENDING: "warning", EXPIRED: "neutral", CANCELLED: "danger" };
const TERM_LABEL: Record<MembershipTermStatus, string> = { ACTIVE: "Active", PENDING: "Awaiting payment", EXPIRED: "Ended", CANCELLED: "Cancelled" };
const PERIOD_LABEL = { MONTHLY: "a month", QUARTERLY: "a quarter", ANNUAL: "a year" } as const;

export function MembershipsView({ plans, members, status }: { plans: PlanView[]; members: MembershipView[]; status: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState<PlanView | null | "new">(null);
  const [busy, setBusy] = useState(false);

  async function savePlan(form: FormData) {
    setBusy(true);
    const plan = editing === "new" ? null : editing;
    const res = await upsertMembershipPlanAction(plan?.id ?? null, {
      key: String(form.get("key")),
      name: String(form.get("name")),
      description: String(form.get("description") ?? ""),
      priceCents: Math.round(Number(form.get("price") ?? 0) * 100),
      period: String(form.get("period")),
      benefits: String(form.get("benefits") ?? "")
        .split("\n")
        .map((b) => b.trim())
        .filter(Boolean),
      periodCreditCents: Math.round(Number(form.get("credit") ?? 0) * 100),
      freeAssessments: Number(form.get("assessments") ?? 0),
      priorityBookingDays: Number(form.get("priority") ?? 0),
      active: form.get("active") === "on",
      sortOrder: Number(form.get("sortOrder") ?? 0),
    });
    setBusy(false);
    if (res.ok) {
      toast({ tone: "success", title: plan ? "Plan updated" : "Plan created" });
      setEditing(null);
      router.refresh();
    } else toast({ tone: "danger", title: "The plan was not saved", description: res.message });
  }

  return (
    <AdminShell
      title="Memberships"
      breadcrumb={["Money", "Memberships"]}
      actions={
        <Button leftIcon={<Plus />} onClick={() => setEditing("new")}>
          New plan
        </Button>
      }
    >
      <section>
        <CardHeader title="Plans" description="A plan's tier key is what a MEMBERSHIP_DISCOUNT pricing rule matches, so the member rate is set on the pricing screen with every other price." />
        {plans.length === 0 ? (
          <EmptyState icon={<BadgeCheck />} title="No plans yet" description="Create one to start selling memberships." action={<Button onClick={() => setEditing("new")}>New plan</Button>} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((p) => (
              <Card key={p.id} className="flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-h4">{p.name}</div>
                    <div className="text-caption font-semibold uppercase tracking-wider text-blue-400">{p.key}</div>
                  </div>
                  {!p.active && <Badge tone="neutral">Off sale</Badge>}
                </div>
                {p.description && <p className="mt-2 text-body-sm text-fg-muted">{p.description}</p>}
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-h3 tabular">{money(p.priceCents, p.currency)}</span>
                  <span className="text-body-sm text-fg-muted">{PERIOD_LABEL[p.period]}</span>
                </div>
                <ul className="mt-3 flex-1 space-y-1.5 text-body-sm text-fg-muted">
                  {p.periodCreditCents > 0 && <li>{money(p.periodCreditCents, p.currency)} of academy credit each period</li>}
                  {p.priorityBookingDays > 0 && <li>Books {count(p.priorityBookingDays, "day")} further ahead</li>}
                  {p.freeAssessments > 0 && <li>{count(p.freeAssessments, "free assessment")}</li>}
                  {p.benefits.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <div className="mt-4 flex items-center justify-between border-t border-line/10 pt-3 text-body-sm">
                  <span className="text-fg-muted">{count(p._count.memberships, "active member")}</span>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                    Edit
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Card padding="none" className="mt-6">
        <CardHeader
          title="Members"
          className="px-5 pt-5"
          action={<Tabs variant="pill" value={status} onChange={(v) => router.push(`/admin/memberships${v ? `?status=${v}` : ""}`)} items={[{ value: "", label: "All" }, { value: "ACTIVE", label: "Active" }, { value: "PENDING", label: "Unpaid" }, { value: "EXPIRED", label: "Ended" }]} />}
        />
        {members.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState compact icon={<BadgeCheck />} title="Nobody here" description="No membership matches this filter." />
          </div>
        ) : (
          <TableWrap className="rounded-none border-0 border-t">
            <Table>
              <THead>
                <TR>
                  <TH>Member</TH>
                  <TH>Plan</TH>
                  <TH>Term</TH>
                  <TH>Status</TH>
                  <TH>Renews</TH>
                  <TH className="text-right">Owed</TH>
                </TR>
              </THead>
              <TBody>
                {members.map((m) => {
                  const invoice = m.invoices[0];
                  const owed = invoice ? Math.max(0, invoice.totalCents - (invoice.paidCents - invoice.refundedCents)) : 0;
                  return (
                    <TR key={m.id}>
                      <TD className="font-semibold">{m.player.name}</TD>
                      <TD className="text-fg-muted">{m.plan.name}</TD>
                      <TD className="whitespace-nowrap text-fg-muted">
                        {plainDate(m.startsOn)} – {plainDate(m.endsOn)}
                      </TD>
                      <TD>
                        <Badge tone={TERM_TONE[m.status]} dot>
                          {TERM_LABEL[m.status]}
                        </Badge>
                      </TD>
                      <TD className="text-fg-muted">{m.autoRenew ? "Automatically" : "No"}</TD>
                      <TD numeric className={owed > 0 ? "font-bold text-warning" : "text-fg-subtle"}>
                        {owed > 0 && invoice ? (
                          <Link href={`/admin/finance/invoices/${invoice.number}`} className="hover:underline">
                            {money(owed)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New plan" : "Edit plan"} description="The tier key links this plan to its pricing rule.">
        <form
          className="space-y-3 pb-2"
          action={savePlan}
          key={editing === "new" ? "new" : (editing?.id ?? "none")}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">{(id) => <Input id={id} name="name" defaultValue={editing !== "new" ? editing?.name : ""} required maxLength={80} />}</Field>
            <Field label="Tier key" hint="Capitals, e.g. PRO.">{(id) => <Input id={id} name="key" defaultValue={editing !== "new" ? editing?.key : ""} required maxLength={40} />}</Field>
          </div>
          <Field label="Description">{(id) => <Textarea id={id} name="description" rows={2} defaultValue={editing !== "new" ? (editing?.description ?? "") : ""} maxLength={500} />}</Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Price">{(id) => <Input id={id} name="price" type="number" step="0.01" min="0" defaultValue={editing !== "new" && editing ? (editing.priceCents / 100).toFixed(2) : ""} required />}</Field>
            <Field label="Billed">{(id) => <Select id={id} name="period" defaultValue={editing !== "new" ? (editing?.period ?? "MONTHLY") : "MONTHLY"} options={[{ value: "MONTHLY", label: "Monthly" }, { value: "QUARTERLY", label: "Quarterly" }, { value: "ANNUAL", label: "Annually" }]} />}</Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Credit per period">{(id) => <Input id={id} name="credit" type="number" step="0.01" min="0" defaultValue={editing !== "new" && editing ? (editing.periodCreditCents / 100).toFixed(2) : "0"} />}</Field>
            <Field label="Priority days">{(id) => <Input id={id} name="priority" type="number" min="0" max="90" defaultValue={editing !== "new" ? (editing?.priorityBookingDays ?? 0) : 0} />}</Field>
            <Field label="Free assessments">{(id) => <Input id={id} name="assessments" type="number" min="0" max="12" defaultValue={editing !== "new" ? (editing?.freeAssessments ?? 0) : 0} />}</Field>
          </div>
          <Field label="Benefits" hint="One per line. Shown to players on the membership page.">
            {(id) => <Textarea id={id} name="benefits" rows={3} defaultValue={editing !== "new" ? (editing?.benefits.join("\n") ?? "") : ""} />}
          </Field>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-body-sm">
              <input type="checkbox" name="active" defaultChecked={editing === "new" ? true : (editing?.active ?? true)} className="size-4 rounded border-line/30" />
              On sale
            </label>
            <Field label="Order" className="flex-1">{(id) => <Input id={id} name="sortOrder" type="number" min="0" max="999" defaultValue={editing !== "new" ? (editing?.sortOrder ?? 0) : 0} />}</Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" type="button" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save plan
            </Button>
          </div>
        </form>
      </Modal>
    </AdminShell>
  );
}
