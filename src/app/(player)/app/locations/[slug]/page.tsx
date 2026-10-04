import { notFound } from "next/navigation";
import { CalendarPlus, Clock, Info, MapPin, Navigation, Phone, Tag } from "lucide-react";
import { PageHeader } from "@/components/nav/player-nav";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { CourtBackdrop } from "@/components/patterns/cards";
import { COURT_TYPES, facilityLabel, PRICING_KINDS } from "@/lib/catalog";
import { DAY_NAMES, DAY_SHORT, dayOfWeekISO, minutesToHHMM, timezoneLabel, todayISO } from "@/lib/time";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { isAppError } from "@/lib/errors";
import type { OpeningHours } from "@/lib/validation/schemas";
import { getLocationPublic } from "@/server/services/locations";
import { getLocationSchedule } from "@/server/services/availability";
import { count } from "@/lib/text";

export const metadata = { title: "Club" };

const hhmm = (m: number) => (m === 1440 ? "24:00" : minutesToHHMM(m));

export default async function LocationPage({ params }: { params: Promise<{ slug: string }> }) {
  const actor = await requireActorOrRedirect();
  const { slug } = await params;
  let loc: Awaited<ReturnType<typeof getLocationPublic>>;
  try {
    loc = await getLocationPublic(actor, slug);
  } catch (e) {
    if (isAppError(e) && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
  const today = todayISO(loc.timezone);
  const todayDow = dayOfWeekISO(today);
  const schedule = loc.status === "ACTIVE" ? await getLocationSchedule(actor, loc.id, today).catch(() => null) : null;
  const availableByCourt = new Map(schedule?.courts.map((c) => [c.court.id, c.slots.filter((s) => s.status === "available").length]) ?? []);
  const hours = (loc.openingHours as OpeningHours | null) ?? null;
  const photos = loc.photos.length ? loc.photos : [{ id: "fallback", url: "/brand/court-net.jpg", alt: loc.name }];
  const peakRules = loc.rules.filter((r) => r.kind === "PEAK" || r.kind === "WEEKEND");
  const memberRules = loc.rules.filter((r) => r.kind === "MEMBERSHIP_DISCOUNT");

  return (
    <div className="space-y-7">
      <PageHeader back="/app/locations" title={loc.name.replace("HITTERS ", "")} eyebrow="HITTERS club" />

      {/* Photos */}
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 no-scrollbar">
        {photos.map((p, i) => (
          <CourtBackdrop key={p.id} src={p.url} overlay="soft" className={`h-56 shrink-0 snap-center rounded-xl ${photos.length === 1 ? "w-full" : "w-[85%]"}`}>
            {i === 0 && (
              <div className="flex h-56 flex-col justify-end p-5 text-white">
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="brand">{count(loc.courts.filter((c) => c.status === "ACTIVE").length, "court")}</Badge>
                  {loc.status === "COMING_SOON" && <Badge tone="warning">Coming soon</Badge>}
                  {loc.openToday && <Badge className="bg-white/15 text-white">Today {hhmm(loc.openToday.opensAt)}–{hhmm(loc.openToday.closesAt)}</Badge>}
                </div>
                <h2 className="mt-2 text-h2">{loc.name}</h2>
                <div className="flex items-center gap-1 text-body-sm text-blue-100/80">
                  <MapPin size={14} /> {loc.address}
                </div>
              </div>
            )}
          </CourtBackdrop>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" href={`/app/book?location=${loc.slug}`} leftIcon={<CalendarPlus />} disabled={loc.status !== "ACTIVE"}>
          Book a court
        </Button>
        <Button size="lg" variant="secondary" leftIcon={<Navigation />} href={loc.latitude && loc.longitude ? `https://maps.google.com/?q=${loc.latitude},${loc.longitude}` : `https://maps.google.com/?q=${encodeURIComponent(loc.address)}`}>
          Directions
        </Button>
      </div>

      {loc.status === "COMING_SOON" && (
        <Alert tone="info" title="Opening soon">
          This club is not taking bookings yet. Follow it from your profile to be first to know.
        </Alert>
      )}

      {loc.description && <p className="text-body text-fg-muted">{loc.description}</p>}

      <Card padding="sm">
        <ul className="divide-y divide-line/10 text-body-sm">
          <li className="flex items-center gap-3 py-2.5">
            <Clock size={16} className="text-blue-300" /> <span className="text-fg-muted">Today</span>{" "}
            <span className="ml-auto font-semibold">{loc.openToday ? `${hhmm(loc.openToday.opensAt)} – ${hhmm(loc.openToday.closesAt)}` : hours ? "Closed today" : "Opening hours coming soon"}</span>
          </li>
          {loc.phone && (
            <li className="flex items-center gap-3 py-2.5">
              <Phone size={16} className="text-blue-300" /> <span className="text-fg-muted">Front desk</span> <span className="ml-auto font-semibold tabular">{loc.phone}</span>
            </li>
          )}
          <li className="flex items-center gap-3 py-2.5">
            <Tag size={16} className="text-blue-300" /> <span className="text-fg-muted">Court rate</span>{" "}
            <span className="ml-auto font-semibold tabular">{loc.priceFromCents != null ? `from EGP ${Math.round(loc.priceFromCents / 100)}/h` : "—"}</span>
          </li>
          <li className="flex items-center gap-3 py-2.5">
            <Info size={16} className="text-blue-300" /> <span className="text-fg-muted">Local time</span> <span className="ml-auto font-semibold">{timezoneLabel(loc.timezone)}</span>
          </li>
        </ul>
      </Card>

      {hours && (
        <section>
          <SectionHeader title="Opening hours" />
          <Card padding="sm">
            <ul className="divide-y divide-line/10 text-body-sm">
              {hours.map((h, i) => (
                <li key={i} className={`flex items-center justify-between py-2 ${i === todayDow ? "font-bold text-fg" : "text-fg-muted"}`}>
                  <span>
                    {DAY_NAMES[i]}
                    {i === todayDow && <Badge tone="brand" size="sm" className="ml-2">Today</Badge>}
                  </span>
                  <span className="tabular">{h ? `${hhmm(h.opensAt)} – ${hhmm(h.closesAt)}` : "Closed"}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {loc.facilities.length > 0 && (
        <section>
          <SectionHeader title="Facilities" />
          <div className="flex flex-wrap gap-2">
            {loc.facilities.map((f) => (
              <Badge key={f} tone="neutral" className="h-8 px-3 text-body-sm">
                {facilityLabel(f)}
              </Badge>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHeader title="Courts" action={schedule ? <span className="text-caption text-fg-muted">Availability today</span> : undefined} />
        {loc.courts.length === 0 ? (
          <Card padding="md" className="text-body-sm text-fg-muted">
            Courts for this club are being set up. Check back shortly.
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {loc.courts.map((c) => {
              const todayWindows = c.availability.filter((a) => a.dayOfWeek === todayDow);
              const base = c.availability.length ? Math.min(...c.availability.map((a) => a.priceCents)) : null;
              const free = availableByCourt.get(c.id);
              return (
                <Card key={c.id} padding="sm" variant={c.status === "MAINTENANCE" ? "outline" : "default"}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-body font-bold">{c.name}</div>
                      <div className="text-caption text-fg-muted">{COURT_TYPES.find((t) => t.value === c.type)?.label}</div>
                    </div>
                    <StatusBadge status={c.status === "ACTIVE" ? (free && free > 0 ? "available" : "booked") : "maintenance"} />
                  </div>
                  <div className="mt-2 text-caption text-fg-muted">
                    {todayWindows.length ? todayWindows.map((w) => `${hhmm(w.opensAt)}–${hhmm(w.closesAt)}`).join(", ") : "Closed today"}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-caption">
                    <span className="text-fg-subtle">{free != null && c.status === "ACTIVE" ? `${free} slot${free === 1 ? "" : "s"} left` : ""}</span>
                    {base != null && <span className="font-bold tabular text-fg">EGP {Math.round(base / 100)}/h</span>}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {(peakRules.length > 0 || memberRules.length > 0) && (
        <section>
          <SectionHeader title="Pricing" />
          <Card padding="sm">
            <ul className="divide-y divide-line/10 text-body-sm">
              {peakRules.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <span>
                    <span className="font-semibold">{r.name}</span>
                    <span className="text-fg-muted">
                      {" "}
                      · {r.daysOfWeek.length ? r.daysOfWeek.map((d) => DAY_SHORT[d]).join(", ") : "every day"}
                      {r.startsAt != null && r.endsAt != null ? ` ${hhmm(r.startsAt)}–${hhmm(r.endsAt)}` : ""}
                    </span>
                  </span>
                  <Badge tone={r.kind === "PEAK" ? "warning" : "brand"}>{r.priceCents != null ? `EGP ${Math.round(r.priceCents / 100)}/h` : `${r.adjustmentPercent! > 0 ? "+" : ""}${r.adjustmentPercent}%`}</Badge>
                </li>
              ))}
              {memberRules.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <span>
                    <span className="font-semibold">{r.name}</span> <span className="text-fg-muted">· {PRICING_KINDS.find((k) => k.value === r.kind)?.label}</span>
                  </span>
                  <Badge tone="volt">{r.adjustmentPercent}%</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}
