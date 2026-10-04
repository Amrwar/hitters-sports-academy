"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CalendarClock, Check, Wallet } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Card, SectionHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { money } from "@/components/patterns/booking-status";
import { plainDate } from "@/lib/time";
import { count } from "@/lib/text";
import { cn } from "@/lib/cn";
import type { MembershipView, PlanView } from "@/server/services/memberships";
import { buyMembershipAction, cancelMembershipAction } from "@/server/actions/finance";

const PERIOD = { MONTHLY: "a month", QUARTERLY: "every three months", ANNUAL: "a year" } as const;

export function MembershipView({ plans, membership }: { plans: PlanView[]; membership: MembershipView | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [buying, setBuying] = useState<PlanView | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);

  const unpaid = membership?.status === "PENDING" ? membership.invoices[0] : null;

  async function act(label: string, fn: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.ok) {
      toast({ tone: "success", title: label });
      setBuying(null);
      setCancelling(false);
      router.refresh();
    } else toast({ tone: "danger", title: "That did not go through", description: res.message });
  }

  return (
    <div className="space-y-6 pb-4">
      <PageHeader eyebrow="Membership" title={membership?.status === "ACTIVE" ? `You are a ${membership.plan.name} member` : "Become a member"} />

      {membership && (
        <Card variant={membership.status === "ACTIVE" ? "brand" : "default"} padding="lg" className={membership.status === "ACTIVE" ? "court-line" : undefined}>
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={cn("text-caption uppercase tracking-wider", membership.status === "ACTIVE" ? "text-white/80" : "text-fg-subtle")}>{membership.plan.name}</div>
                <div className="mt-1 text-h2">{money(membership.plan.priceCents, membership.plan.currency)}</div>
                <div className={cn("text-body-sm", membership.status === "ACTIVE" ? "text-white/85" : "text-fg-muted")}>{PERIOD[membership.plan.period]}</div>
              </div>
              <Badge tone={membership.status === "ACTIVE" ? "success" : "warning"} size="md" dot>
                {membership.status === "ACTIVE" ? "Active" : "Awaiting payment"}
              </Badge>
            </div>
            <div className={cn("mt-4 flex items-center gap-2 text-body-sm", membership.status === "ACTIVE" ? "text-white/85" : "text-fg-muted")}>
              <CalendarClock className="size-4" />
              {plainDate(membership.startsOn)} to {plainDate(membership.endsOn)}
              {membership.autoRenew ? " · renews automatically" : ""}
            </div>
          </div>
        </Card>
      )}

      {unpaid && (
        <Alert tone="warning" title="Your membership starts once it is paid for" action={<Button size="sm" href={`/app/billing/${unpaid.number}`}>Pay {money(unpaid.totalCents - unpaid.paidCents + unpaid.refundedCents)}</Button>}>
          Member rates and benefits begin the moment the payment lands.
        </Alert>
      )}

      {membership?.status === "ACTIVE" && membership.plan.benefits.length > 0 && (
        <section>
          <SectionHeader eyebrow="Included" title="What you get" />
          <Card padding="md">
            <ul className="space-y-2.5 text-body-sm">
              {membership.plan.periodCreditCents > 0 && (
                <li className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" />
                  {money(membership.plan.periodCreditCents)} of academy credit each period
                </li>
              )}
              {membership.plan.priorityBookingDays > 0 && (
                <li className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" />
                  Book {count(membership.plan.priorityBookingDays, "day")} further ahead than everyone else
                </li>
              )}
              {membership.plan.benefits.map((b) => (
                <li key={b} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" />
                  {b}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {(!membership || membership.status !== "PENDING") && (
        <section>
          <SectionHeader eyebrow={membership?.status === "ACTIVE" ? "Renew or change" : "Plans"} title={membership?.status === "ACTIVE" ? "Other plans" : "Choose a plan"} />
          {plans.length === 0 ? (
            <EmptyState compact icon={<BadgeCheck />} title="No plans on sale" description="Ask the front desk about membership." />
          ) : (
            <div className="space-y-3">
              {plans.map((p) => {
                const current = membership?.status === "ACTIVE" && membership.plan.id === p.id;
                return (
                  <Card key={p.id} padding="md" className={cn(current && "border-volt/40")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-body font-bold">{p.name}</span>
                          {current && <Badge tone="success" size="sm">Your plan</Badge>}
                        </div>
                        {p.description && <p className="mt-1 text-caption text-fg-muted">{p.description}</p>}
                        <ul className="mt-2.5 space-y-1 text-caption text-fg-muted">
                          {p.periodCreditCents > 0 && <li>· {money(p.periodCreditCents)} credit each period</li>}
                          {p.priorityBookingDays > 0 && <li>· Books {count(p.priorityBookingDays, "day")} further ahead</li>}
                          {p.benefits.slice(0, 3).map((b) => (
                            <li key={b}>· {b}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-h4 tabular">{money(p.priceCents, p.currency)}</div>
                        <div className="text-caption text-fg-subtle">{PERIOD[p.period]}</div>
                        <Button size="sm" className="mt-2" variant={current ? "secondary" : "primary"} onClick={() => setBuying(p)}>
                          {current ? "Renew" : "Join"}
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      )}

      {membership?.status === "ACTIVE" && (
        <Button variant="ghost" fullWidth className="text-danger hover:bg-danger/10 hover:text-danger" onClick={() => setCancelling(true)}>
          Cancel membership
        </Button>
      )}

      <ConfirmDialog
        open={!!buying}
        onClose={() => setBuying(null)}
        title={buying ? `Join ${buying.name}?` : ""}
        description={
          buying
            ? `${money(buying.priceCents, buying.currency)} ${PERIOD[buying.period]}. An invoice is raised now; your membership starts the moment it is paid.${membership?.status === "ACTIVE" ? " The new term begins when your current one ends, so you lose no days." : ""}`
            : ""
        }
        confirmLabel="Join"
        loading={busy}
        onConfirm={() => buying && act("Membership started", () => buyMembershipAction({ planId: buying.id }))}
      />

      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Cancel your membership?"
        description={membership ? `It will not renew, and runs to ${plainDate(membership.endsOn)}. Ask the front desk if you need it to end sooner.` : ""}
        confirmLabel="Stop renewing"
        tone="danger"
        loading={busy}
        onConfirm={() => membership && act("Your membership will not renew", () => cancelMembershipAction(membership.id, {}))}
      />
    </div>
  );
}
