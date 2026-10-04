"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, CheckCircle2, CreditCard, UserX, XCircle } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { BookingStatusBadge, PAY_LABEL, PaymentStatusBadge, money } from "@/components/patterns/booking-status";
import { formatInZone } from "@/lib/time";
import type { BookingView } from "@/server/services/bookings";
import { cancelBookingAction, recordPaymentAction, setBookingStatusAction } from "@/server/actions/bookings";
import { auditLabel, label } from "@/lib/catalog";

type Log = { id: string; action: string; at: Date; by: string };

export function AdminBookingDetail({ booking, canManage, canPay, logs }: { booking: BookingView; canManage: boolean; canPay: boolean; logs: Log[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const tz = booking.location.timezone;
  const start = new Date(booking.startsAt);
  const started = start <= new Date();
  const active = booking.status === "CONFIRMED" || booking.status === "PENDING";
  const payment = booking.payments[0];

  async function act(label: string, fn: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.ok) toast({ tone: "success", title: label });
    else toast({ tone: "danger", title: res.message ?? "Action failed" });
    router.refresh();
  }

  return (
    <AdminShell
      title={booking.confirmationCode}
      breadcrumb={["Operations", "Bookings", booking.confirmationCode]}
      actions={
        <>
          <BookingStatusBadge status={booking.status} />
          <Button variant="secondary" href={`/admin/calendar?location=${booking.locationId}&date=${formatInZone(start, tz, { year: "numeric", month: "2-digit", day: "2-digit" }).split("/").reverse().join("-")}`} leftIcon={<CalendarRange />}>
            Calendar
          </Button>
          <Button variant="secondary" href="/admin/bookings">
            All bookings
          </Button>
        </>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          <Card variant="brand" padding="lg" className="court-line">
            <div className="relative">
              <div className="text-overline uppercase text-white/80">{formatInZone(start, tz, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
              <div className="mt-2 text-display tabular">
                {formatInZone(start, tz, { hour: "2-digit", minute: "2-digit" })}
                <span className="text-h3 text-white/70"> – {formatInZone(new Date(booking.endsAt), tz, { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <div className="mt-1 text-body-lg font-semibold">
                {booking.court.name} · {booking.location.name}
              </div>
              <div className="text-body-sm text-white/80">
                {booking.durationMinutes} min · {money(booking.priceCents, booking.currency)} · {label("bookingSource", booking.source)}
              </div>
            </div>
          </Card>

          {booking.status === "CANCELLED" && (
            <Alert tone="danger" title={`Cancelled ${booking.cancelledAt ? formatInZone(new Date(booking.cancelledAt), tz) : ""} by ${booking.cancelledBy?.name ?? "the player"}`}>
              {booking.cancellationReason ?? "No reason recorded."}
              {booking.rescheduledTo && (
                <>
                  {" "}
                  Moved to{" "}
                  <a className="font-semibold underline" href={`/admin/bookings/${booking.rescheduledTo.id}`}>
                    {booking.rescheduledTo.confirmationCode}
                  </a>
                  .
                </>
              )}
            </Alert>
          )}
          {booking.rescheduledFromId && (
            <Alert tone="info">
              This booking replaced{" "}
              <a className="font-semibold underline" href={`/admin/bookings/${booking.rescheduledFromId}`}>
                an earlier reservation
              </a>
              .
            </Alert>
          )}

          <Card>
            <CardHeader title="Players" description={`${booking.participants.length} participant${booking.participants.length === 1 ? "" : "s"}`} />
            <ul className="divide-y divide-line/10">
              {booking.participants.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <Avatar name={p.user?.name ?? p.guestName ?? "Guest"} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body-sm font-bold">{p.user?.name ?? p.guestName ?? "Guest"}</div>
                    <div className="text-caption capitalize text-fg-muted">{label("participantRole", p.role)}</div>
                  </div>
                  <Badge size="sm" tone={p.status === "JOINED" ? "success" : p.status === "INVITED" ? "warning" : "neutral"}>
                    {label("participantStatus", p.status)}
                  </Badge>
                </li>
              ))}
            </ul>
            <div className="mt-3 rounded-md bg-surface-2 p-3 text-body-sm text-fg-muted">
              Booked by <span className="font-semibold text-fg">{booking.player?.name ?? booking.guestName ?? "Guest"}</span>
              {booking.player?.email && <> · {booking.player.email}</>}
              {(booking.player?.phone ?? booking.guestPhone) && <> · {booking.player?.phone ?? booking.guestPhone}</>}
              {booking.createdBy && booking.createdBy.id !== booking.playerId && <> · created by {booking.createdBy.name}</>}
            </div>
            {booking.notes && <p className="mt-3 text-body-sm text-fg-muted">Notes: {booking.notes}</p>}
          </Card>

          <Card>
            <CardHeader title="History" />
            <ol className="relative space-y-3 border-l border-line/10 pl-4">
              {logs.map((l) => (
                <li key={l.id} className="text-body-sm">
                  <span className="absolute -left-1 mt-1.5 size-2 rounded-full bg-blue-400" />
                  <span className="font-semibold capitalize">{auditLabel(l.action)}</span>
                  <span className="text-fg-muted">
                    {" "}
                    · {l.by} · {formatInZone(new Date(l.at), tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Payment" description="Online payments are not connected yet. Record venue payments here." />
            <div className="flex items-center justify-between rounded-md bg-surface-2 p-3">
              <div>
                <div className="text-h3 tabular">{money(booking.priceCents, booking.currency)}</div>
                <div className="text-caption text-fg-muted">{payment ? `${PAY_LABEL[payment.status]}${payment.method !== "NONE" ? ` · ${payment.method.toLowerCase()}` : ""}${payment.paidAt ? ` · ${formatInZone(new Date(payment.paidAt), tz)}` : ""}` : "No payment record"}</div>
              </div>
              {payment && <PaymentStatusBadge status={payment.status} />}
            </div>
            {canPay && booking.status !== "CANCELLED" && payment?.status === "PENDING" && (
              <Button className="mt-3" fullWidth leftIcon={<CreditCard />} onClick={() => setPayOpen(true)}>
                Record payment
              </Button>
            )}
          </Card>

          {canManage && (
            <Card>
              <CardHeader title="Actions" />
              <div className="space-y-2">
                {active && !started && (
                  <Button variant="danger" fullWidth leftIcon={<XCircle />} disabled={busy} onClick={() => setCancelOpen(true)}>
                    Cancel booking
                  </Button>
                )}
                {started && booking.status !== "CANCELLED" && booking.status !== "COMPLETED" && (
                  <Button variant="secondary" fullWidth leftIcon={<CheckCircle2 />} loading={busy} onClick={() => act("Marked completed", () => setBookingStatusAction(booking.id, "COMPLETED"))}>
                    Mark completed
                  </Button>
                )}
                {started && booking.status !== "CANCELLED" && booking.status !== "NO_SHOW" && (
                  <Button variant="ghost" fullWidth leftIcon={<UserX />} className="text-danger hover:bg-danger/10 hover:text-danger" loading={busy} onClick={() => act("Marked no-show", () => setBookingStatusAction(booking.id, "NO_SHOW"))}>
                    Mark no-show
                  </Button>
                )}
                {!started && !active && <p className="text-body-sm text-fg-muted">No actions available for this booking.</p>}
                {active && !started && <p className="text-caption text-fg-subtle">Attendance can be recorded once the booking has started.</p>}
              </div>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        tone="danger"
        title={`Cancel ${booking.confirmationCode}?`}
        description="The player is notified and the slot becomes available again."
        confirmLabel="Cancel booking"
        loading={busy}
        onConfirm={async () => {
          await act("Booking cancelled", () => cancelBookingAction(booking.id, "Cancelled by staff"));
          setCancelOpen(false);
        }}
      />

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Record payment" description={`${money(booking.priceCents, booking.currency)} for ${booking.confirmationCode}`} size="sm">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await act("Payment recorded", () => recordPaymentAction(booking.id, { method: f.get("method") as "CASH", status: f.get("status") as "PAID" }));
            setPayOpen(false);
          }}
        >
          <Field label="Method">{(id) => <Select id={id} name="method" defaultValue="CASH" options={[{ value: "CASH", label: "Cash" }, { value: "CARD", label: "Card at venue" }, { value: "WALLET", label: "Wallet" }]} />}</Field>
          <Field label="Outcome">{(id) => <Select id={id} name="status" defaultValue="PAID" options={[{ value: "PAID", label: "Paid in full" }, { value: "WAIVED", label: "Waived (no charge)" }]} />}</Field>
          
          <div className="flex justify-end gap-2 pb-2">
            <Button type="button" variant="ghost" onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </AdminShell>
  );
}
