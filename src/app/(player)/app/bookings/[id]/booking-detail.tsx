"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, MapPin, Navigation, Receipt, Swords, Users, XCircle } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { Field, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { BookingStatusBadge, PaymentStatusBadge, money } from "@/components/patterns/booking-status";
import { formatInZone } from "@/lib/time";
import type { BookingView } from "@/server/services/bookings";
import { cancelBookingAction } from "@/server/actions/bookings";
import { label } from "@/lib/catalog";
import { count } from "@/lib/text";

export function BookingDetail({ booking, viewerId }: { booking: BookingView; viewerId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tz = booking.location.timezone;
  const start = new Date(booking.startsAt);
  const end = new Date(booking.endsAt);
  const active = booking.status === "CONFIRMED" || booking.status === "PENDING";
  const cutoff = booking.location.bookingPolicy?.cancellationCutoffHours ?? 12;
  const freeUntil = new Date(start.getTime() - cutoff * 3_600_000);
  const canChange = active && start > new Date();
  const withinFreeWindow = new Date() < freeUntil;
  const isOwner = booking.playerId === viewerId;
  const payment = booking.payments[0];

  async function cancel(form: FormData) {
    setBusy(true);
    setError(null);
    const res = await cancelBookingAction(booking.id, String(form.get("reason") ?? "") || undefined);
    setBusy(false);
    if (res.ok) {
      setCancelOpen(false);
      toast({ tone: "success", title: "Booking cancelled" });
      router.refresh();
    } else setError(res.message);
  }

  return (
    <div className="space-y-6">
      <PageHeader back="/app/bookings" eyebrow={booking.confirmationCode} title={booking.court.name} action={<BookingStatusBadge status={booking.status} />} />

      <Card variant={active ? "brand" : "default"} padding="lg" className={active ? "court-line" : ""}>
        <div className="relative">
          <div className={`text-overline uppercase ${active ? "text-white/80" : "text-fg-subtle"}`}>{formatInZone(start, tz, { weekday: "long", day: "numeric", month: "long" })}</div>
          <div className="mt-2 text-display tabular">
            {formatInZone(start, tz, { hour: "2-digit", minute: "2-digit" })}
            <span className={`text-h3 ${active ? "text-white/70" : "text-fg-muted"}`}> – {formatInZone(end, tz, { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <div className="mt-1 text-body-lg font-semibold">{booking.location.name}</div>
          <div className={`flex items-center gap-1 text-body-sm ${active ? "text-white/80" : "text-fg-muted"}`}>
            <MapPin size={14} /> {booking.court.name} · {booking.durationMinutes} min · {booking.location.address}
          </div>
          {active && (
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="secondary" className="border-transparent bg-white text-blue-700 hover:bg-blue-50" href={`https://maps.google.com/?q=${encodeURIComponent(booking.location.address)}`} leftIcon={<Navigation />}>
                Directions
              </Button>
              {canChange && isOwner && (
                <Button variant="outline" className="border-white/40 text-white hover:bg-white/10" href={`/app/book?reschedule=${booking.id}`} leftIcon={<CalendarClock />}>
                  Reschedule
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {booking.status === "CANCELLED" && (
        <Alert tone="danger" title="This booking was cancelled">
          {booking.cancellationReason ?? "No reason recorded."}
          {booking.rescheduledTo && (
            <>
              {" "}
              It was moved to{" "}
              <a className="font-semibold underline" href={`/app/bookings/${booking.rescheduledTo.id}`}>
                {booking.rescheduledTo.confirmationCode}
              </a>
              .
            </>
          )}
        </Alert>
      )}
      {booking.status === "NO_SHOW" && <Alert tone="warning" title="Marked as no-show">The court was held but nobody checked in.</Alert>}

      <Card padding="sm">
        <ul className="divide-y divide-line/10 text-body-sm">
          <li className="flex items-center gap-3 py-2.5">
            <Receipt size={16} className="text-blue-300" /> <span className="text-fg-muted">Total</span>{" "}
            <span className="ml-auto flex items-center gap-2 font-semibold tabular">
              {money(booking.priceCents, booking.currency)} {payment && <PaymentStatusBadge status={payment.status} size="sm" />}
            </span>
          </li>
          <li className="flex items-center gap-3 py-2.5">
            <CalendarClock size={16} className="text-blue-300" /> <span className="text-fg-muted">Free cancellation</span>{" "}
            <span className="ml-auto text-right font-semibold">{active ? (withinFreeWindow ? `until ${formatInZone(freeUntil, tz)}` : "window passed") : "—"}</span>
          </li>
          <li className="flex items-center gap-3 py-2.5">
            <Users size={16} className="text-blue-300" /> <span className="text-fg-muted">Booked by</span>{" "}
            <span className="ml-auto font-semibold">{booking.player?.name ?? booking.guestName ?? "Guest"}</span>
          </li>
        </ul>
      </Card>

      <section>
        <SectionHeader title="Players" eyebrow={`${booking.participants.filter((p) => p.status !== "REMOVED" && p.status !== "DECLINED").length} of 4`} />
        <div className="space-y-2">
          {booking.participants.map((p) => (
            <Card key={p.id} padding="sm">
              <div className="flex items-center gap-3">
                <Avatar name={p.user?.name ?? p.guestName ?? "Guest"} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body-sm font-bold">{p.user?.name ?? p.guestName ?? "Guest"}</div>
                  <div className="text-caption capitalize text-fg-muted">{label("participantRole", p.role)}</div>
                </div>
                <Badge size="sm" tone={p.status === "JOINED" ? "success" : p.status === "INVITED" ? "warning" : "neutral"}>
                  {label("participantStatus", p.status)}
                </Badge>
              </div>
            </Card>
          ))}
          {booking.gameSession ? (
            <Card variant="interactive" padding="sm" href={`/app/play/${booking.gameSession.code}`}>
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-md bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-400/20">
                  <Swords size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-bold">Game {booking.gameSession.code}</div>
                  <div className="text-caption text-fg-muted">{label("gameStatus", booking.gameSession.status)} · {count(booking.gameSession.maxPlayers, "player")}</div>
                </div>
                <span className="text-caption font-semibold text-blue-300">Open</span>
              </div>
            </Card>
          ) : canChange && isOwner ? (
            <Button variant="secondary" fullWidth leftIcon={<Swords />} href={`/app/play/new?booking=${booking.id}`}>
              Organize a game on this court
            </Button>
          ) : (
            <Card variant="outline" padding="sm" className="text-center text-caption text-fg-subtle">
              No game has been organized on this booking.
            </Card>
          )}
        </div>
      </section>

      {booking.notes && (
        <Card padding="md">
          <div className="text-caption font-bold uppercase tracking-wider text-fg-subtle">Notes</div>
          <p className="mt-1 text-body-sm text-fg-muted">{booking.notes}</p>
        </Card>
      )}

      {canChange && isOwner && (
        <Button variant="ghost" fullWidth leftIcon={<XCircle />} className="text-danger hover:bg-danger/10 hover:text-danger" onClick={() => setCancelOpen(true)}>
          Cancel booking
        </Button>
      )}

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this booking?"
        description={withinFreeWindow ? "You are inside the free cancellation window. Nothing will be charged." : `The free cancellation window closed ${cutoff} hours before the booking, so the club must approve this change.`}
        size="sm"
      >
        <form action={cancel} className="space-y-4">
          {error && <Alert tone="danger" title="Cancellation not allowed">{error}</Alert>}
          <Field label="Reason (optional)">{(id) => <Textarea id={id} name="reason" placeholder="Let the club know why" maxLength={500} />}</Field>
          <div className="flex justify-end gap-2 pb-2">
            <Button type="button" variant="ghost" onClick={() => setCancelOpen(false)}>
              Keep booking
            </Button>
            <Button type="submit" variant="danger" loading={busy}>
              Cancel booking
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
