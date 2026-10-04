"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { BookingStatus } from "@prisma/client";
import { CalendarDays, ChevronLeft, ChevronRight, MoreHorizontal, Plus, Search } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dropdown, type DropdownItem } from "@/components/ui/dropdown";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/states";
import { TBody, TD, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { TimeSelect } from "@/components/ui/time-select";
import { useToast } from "@/components/ui/toast";
import { BookingStatusBadge, PaymentStatusBadge, money } from "@/components/patterns/booking-status";
import { addDaysISO, formatInZone, todayISO } from "@/lib/time";
import type { BookingView } from "@/server/services/bookings";
import { cancelBookingAction, createBookingAction, recordPaymentAction, setBookingStatusAction } from "@/server/actions/bookings";

type Props = {
  locations: { id: string; name: string; timezone: string }[];
  selectedId: string | null;
  dateISO: string | null;
  status: BookingStatus | null;
  query: string;
  result: { items: BookingView[]; total: number };
  courts: { id: string; name: string; durations: number[] }[];
  members: { id: string; name: string; email: string }[];
  canManage: boolean;
  canPay: boolean;
};

const ERROR_TITLES: Record<string, string> = {
  SLOT_UNAVAILABLE: "Slot no longer available",
  COURT_UNAVAILABLE: "Court unavailable",
  INVALID_DURATION: "Invalid duration",
  LOCATION_CLOSED: "Location closed",
  CANCELLATION_NOT_ALLOWED: "Cancellation not allowed",
};

export function BookingsAdmin({ locations, selectedId, dateISO, status, query, result, courts, members, canManage, canPay }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [create, setCreate] = useState(false);
  const [cancel, setCancel] = useState<BookingView | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<{ code: string; message: string } | null>(null);
  const location = locations.find((l) => l.id === selectedId);

  const go = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string | null> = { location: selectedId, date: dateISO, status, q: query || null, ...patch };
    if (merged.date === null && !("all" in patch && patch.all === null)) merged.all = "1";
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    router.push(`/admin/bookings?${params.toString()}`);
  };

  async function act(label: string, fn: () => Promise<{ ok: boolean; message?: string; code?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.ok) toast({ tone: "success", title: label });
    else toast({ tone: "danger", title: (res.code && ERROR_TITLES[res.code]) ?? "Action failed", description: res.message });
    router.refresh();
  }

  async function submitCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input: Record<string, unknown> = {
      courtId: f.get("courtId"),
      dateISO: f.get("dateISO"),
      startMinutes: Number(f.get("startMinutes")),
      durationMinutes: Number(f.get("durationMinutes")),
      notes: f.get("notes"),
    };
    const member = String(f.get("playerId") ?? "");
    if (member) input.playerId = member;
    else {
      input.guestName = f.get("guestName");
      input.guestPhone = f.get("guestPhone");
    }
    setBusy(true);
    setFormError(null);
    const res = await createBookingAction(input);
    setBusy(false);
    if (res.ok) {
      setCreate(false);
      toast({ tone: "success", title: `Booked ${res.data.court.name} · ${res.data.confirmationCode}` });
      go({ date: res.data.startsAt ? formatInZone(new Date(res.data.startsAt), location?.timezone ?? "UTC", { year: "numeric", month: "2-digit", day: "2-digit" }).split("/").reverse().join("-") : dateISO });
    } else setFormError({ code: res.code, message: res.message });
  }

  const counts = result.items.reduce<Record<string, number>>((acc, b) => ({ ...acc, [b.status]: (acc[b.status] ?? 0) + 1 }), {});
  const revenue = result.items.filter((b) => b.status !== "CANCELLED").reduce((n, b) => n + b.priceCents, 0);

  return (
    <AdminShell title="Bookings" breadcrumb={["Operations", "Bookings"]} actions={canManage && selectedId ? <Button leftIcon={<Plus />} onClick={() => setCreate(true)}>New booking</Button> : undefined}>
      {locations.length === 0 ? (
        <EmptyState icon={<CalendarDays />} title="No clubs assigned to you yet" description="Ask an academy owner to give you access to a location." />
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Tabs variant="pill" value={selectedId ?? ""} onChange={(id) => go({ location: id })} items={locations.map((l) => ({ value: l.id, label: l.name.replace("HITTERS ", "") }))} className="w-fit max-w-full overflow-x-auto" />
            <div className="flex flex-wrap items-center gap-2">
              <IconButton size="sm" variant="secondary" label="Previous day" disabled={!dateISO} onClick={() => dateISO && go({ date: addDaysISO(dateISO, -1) })}>
                <ChevronLeft />
              </IconButton>
              <Input size="sm" type="date" value={dateISO ?? ""} onChange={(e) => go({ date: e.target.value || null, all: e.target.value ? null : "1" })} aria-label="Date" className="w-40" />
              <IconButton size="sm" variant="secondary" label="Next day" disabled={!dateISO} onClick={() => dateISO && go({ date: addDaysISO(dateISO, 1) })}>
                <ChevronRight />
              </IconButton>
              <Button size="sm" variant={dateISO ? "ghost" : "secondary"} onClick={() => go(dateISO ? { date: null, all: "1" } : { date: todayISO(location?.timezone ?? "Africa/Cairo"), all: null })}>
                {dateISO ? "All dates" : "Today"}
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Card padding="sm">
              <div className="text-caption font-semibold uppercase tracking-wider text-fg-subtle">{dateISO ? "Bookings that day" : "Matching bookings"}</div>
              <div className="mt-1 text-h2 tabular">{result.total}</div>
            </Card>
            <Card padding="sm">
              <div className="text-caption font-semibold uppercase tracking-wider text-fg-subtle">Confirmed · completed · no-show</div>
              <div className="mt-1 text-h2 tabular">
                {counts.CONFIRMED ?? 0} · {counts.COMPLETED ?? 0} · {counts.NO_SHOW ?? 0}
              </div>
            </Card>
            <Card padding="sm">
              <div className="text-caption font-semibold uppercase tracking-wider text-fg-subtle">Court revenue (excl. cancelled)</div>
              <div className="mt-1 text-h2 tabular">{money(revenue)}</div>
            </Card>
          </div>

          <Card padding="sm" className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
            <form
              className="flex flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                go({ q: String(new FormData(e.currentTarget).get("q") ?? "") || null });
              }}
            >
              <div className="flex-1">
                <Input size="sm" name="q" defaultValue={query} placeholder="Search code, member or guest" leading={<Search />} aria-label="Search bookings" />
              </div>
              <Button size="sm" variant="secondary" type="submit">
                Search
              </Button>
            </form>
            <Tabs
              variant="pill"
              value={status ?? "ALL"}
              onChange={(v) => go({ status: v === "ALL" ? null : v })}
              items={[
                { value: "ALL", label: "All" },
                { value: "CONFIRMED", label: "Confirmed" },
                { value: "COMPLETED", label: "Completed" },
                { value: "NO_SHOW", label: "No-show" },
                { value: "CANCELLED", label: "Cancelled" },
              ]}
            />
          </Card>

          {result.items.length === 0 ? (
            <EmptyState className="mt-4" icon={<CalendarDays />} title="No bookings" description={dateISO ? "Nothing booked for this day." : "No bookings match the filters."} action={canManage ? <Button leftIcon={<Plus />} onClick={() => setCreate(true)}>New booking</Button> : undefined} />
          ) : (
            <TableWrap className="mt-4">
              <Table>
                <THead>
                  <TR>
                    <TH>Code</TH>
                    <TH>Player</TH>
                    <TH>Court</TH>
                    <TH>When</TH>
                    <TH>Status</TH>
                    <TH>Payment</TH>
                    <TH className="text-right">Amount</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {result.items.map((b) => {
                    const tz = b.location.timezone;
                    const started = new Date(b.startsAt) <= new Date();
                    const active = b.status === "CONFIRMED" || b.status === "PENDING";
                    const payment = b.payments[0];
                    const items: DropdownItem[] = [{ label: "View details", onSelect: () => router.push(`/admin/bookings/${b.id}`) }];
                    if (canManage && active && !started) items.push({ label: "Cancel booking", tone: "danger", onSelect: () => setCancel(b) });
                    if (canManage && started && b.status !== "CANCELLED") {
                      if (b.status !== "COMPLETED") items.push({ label: "Mark completed", onSelect: () => act("Marked completed", () => setBookingStatusAction(b.id, "COMPLETED")) });
                      if (b.status !== "NO_SHOW") items.push({ label: "Mark no-show", tone: "danger", onSelect: () => act("Marked no-show", () => setBookingStatusAction(b.id, "NO_SHOW")) });
                    }
                    if (canPay && b.status !== "CANCELLED" && payment?.status === "PENDING") {
                      items.push({ label: "Record cash payment", onSelect: () => act("Payment recorded", () => recordPaymentAction(b.id, { method: "CASH" })) });
                      items.push({ label: "Record card payment", onSelect: () => act("Payment recorded", () => recordPaymentAction(b.id, { method: "CARD" })) });
                    }
                    return (
                      <TR key={b.id} interactive onClick={() => router.push(`/admin/bookings/${b.id}`)}>
                        <TD className="whitespace-nowrap font-semibold tabular text-fg-muted">{b.confirmationCode}</TD>
                        <TD>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={b.player?.name ?? b.guestName ?? "Guest"} size="xs" />
                            <div>
                              <div className="font-semibold">{b.player?.name ?? b.guestName ?? "Guest"}</div>
                              {!b.player && <Badge size="sm">Walk-in</Badge>}
                            </div>
                          </div>
                        </TD>
                        <TD>{b.court.name}</TD>
                        <TD className="whitespace-nowrap tabular">
                          {formatInZone(new Date(b.startsAt), tz, { day: "numeric", month: "short" })} · {formatInZone(new Date(b.startsAt), tz, { hour: "2-digit", minute: "2-digit" })} · {b.durationMinutes} min
                        </TD>
                        <TD>
                          <BookingStatusBadge status={b.status} />
                        </TD>
                        <TD>{payment ? <PaymentStatusBadge status={payment.status} /> : "—"}</TD>
                        <TD numeric className="font-semibold">
                          {money(b.priceCents, b.currency)}
                        </TD>
                        <TD className="w-12" onClick={(e) => e.stopPropagation()}>
                          <Dropdown
                            trigger={
                              <IconButton variant="ghost" size="sm" label="Booking actions" disabled={busy}>
                                <MoreHorizontal />
                              </IconButton>
                            }
                            items={items}
                          />
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </>
      )}

      <Modal open={create} onClose={() => setCreate(false)} title="New booking" description={`Reservation at ${location?.name ?? ""}. Staff bookings skip notice and window limits but never double-book.`} size="lg">
        <form onSubmit={submitCreate} className="grid gap-4 sm:grid-cols-2">
          {formError && (
            <div className="sm:col-span-2">
              <Alert tone="danger" title={ERROR_TITLES[formError.code] ?? "The booking did not go through"}>
                {formError.message}
              </Alert>
            </div>
          )}
          <Field label="Member" hint="Leave empty for a walk-in guest." className="sm:col-span-2">
            {(id) => <Select id={id} name="playerId" defaultValue="" options={[{ value: "", label: "Walk-in guest (no account)" }, ...members.map((m) => ({ value: m.id, label: `${m.name} · ${m.email}` }))]} />}
          </Field>
          <Field label="Guest name">{(id) => <Input id={id} name="guestName" placeholder="Required for walk-ins" />}</Field>
          <Field label="Guest phone">{(id) => <Input id={id} name="guestPhone" type="tel" placeholder="Optional" />}</Field>
          <Field label="Court">{(id) => <Select id={id} name="courtId" required placeholder="Choose a court" options={courts.map((c) => ({ value: c.id, label: c.name }))} />}</Field>
          <Field label="Date">{(id) => <Input id={id} name="dateISO" type="date" required defaultValue={dateISO ?? todayISO(location?.timezone ?? "Africa/Cairo")} />}</Field>
          <Field label="Start time">{() => <StartTime />}</Field>
          <Field label="Duration">
            {(id) => <Select id={id} name="durationMinutes" defaultValue="60" options={[60, 90, 120].map((d) => ({ value: String(d), label: `${d} min` }))} />}
          </Field>
          <Field label="Notes" className="sm:col-span-2">{(id) => <Input id={id} name="notes" placeholder="Optional" maxLength={500} />}</Field>
          <div className="flex justify-end gap-2 pb-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Create booking
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!cancel}
        onClose={() => setCancel(null)}
        tone="danger"
        title={`Cancel ${cancel?.confirmationCode ?? ""}?`}
        description="The player is notified and the slot becomes available again. Paid amounts are marked refunded."
        confirmLabel="Cancel booking"
        loading={busy}
        onConfirm={async () => {
          if (cancel) await act("Booking cancelled", () => cancelBookingAction(cancel.id, "Cancelled by staff"));
          setCancel(null);
        }}
      />
    </AdminShell>
  );
}

function StartTime() {
  const [m, setM] = useState(18 * 60);
  return (
    <>
      <TimeSelect value={m} onChange={setM} min={6 * 60} max={23 * 60} size="md" aria-label="Start time" />
      <input type="hidden" name="startMinutes" value={m} />
    </>
  );
}
