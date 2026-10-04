"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PricingRule } from "@prisma/client";
import { ArrowDown, ArrowUp, CalendarRange, Clock, ImagePlus, LayoutGrid, MapPin, Plus, Settings2, Tag, Trash2 } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button, IconButton } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { Checkbox, Chip, Switch } from "@/components/ui/misc";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/states";
import { TimeSelect } from "@/components/ui/time-select";
import { useToast } from "@/components/ui/toast";
import { OpeningHoursEditor, DEFAULT_HOURS } from "@/components/patterns/opening-hours-editor";
import { BRAND_PHOTOS, DURATION_OPTIONS, FACILITIES, LOCATION_STATUSES, PRICING_KINDS, TIMEZONES } from "@/lib/catalog";
import { DAY_SHORT, minutesToHHMM } from "@/lib/time";
import type { OpeningHours } from "@/lib/validation/schemas";
import type { LocationView } from "@/server/services/locations";
import {
  addLocationPhotoAction,
  createPricingRuleAction,
  deletePricingRuleAction,
  removeLocationPhotoAction,
  reorderLocationPhotosAction,
  updateLocationAction,
  updatePricingRuleAction,
  upsertBookingPolicyAction,
} from "@/server/actions/admin";

type Tab = "details" | "photos" | "hours" | "facilities" | "policy" | "pricing";
type Props = { location: LocationView; courts: { id: string; name: string }[]; rules: PricingRule[]; canManage: boolean; canPrice: boolean; isGlobal: boolean };

export function LocationEditor({ location, courts, rules, canManage, canPrice, isGlobal }: Props) {
  const [tab, setTab] = useState<Tab>("details");
  return (
    <AdminShell
      title={location.name}
      breadcrumb={["Operations", "Locations", location.name.replace("HITTERS ", "")]}
      actions={
        <>
          <StatusBadge status={location.status === "ACTIVE" ? "active" : location.status === "COMING_SOON" ? "pending" : "paused"} />
          <Button variant="secondary" href={`/admin/courts?location=${location.id}`} leftIcon={<LayoutGrid />}>
            Courts
          </Button>
          <Button variant="secondary" href={`/admin/calendar?location=${location.id}`} leftIcon={<CalendarRange />}>
            Calendar
          </Button>
        </>
      }
    >
      {!canManage && (
        <Alert tone="info" className="mb-4">
          You can view this location. Editing requires the location manager role.
        </Alert>
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "details", label: "Details", icon: <MapPin /> },
          { value: "photos", label: "Photos", icon: <ImagePlus />, count: location.photos.length },
          { value: "hours", label: "Opening hours", icon: <Clock /> },
          { value: "facilities", label: "Facilities", icon: <Settings2 />, count: location.facilities.length },
          { value: "policy", label: "Booking policy" },
          { value: "pricing", label: "Pricing", icon: <Tag />, count: rules.length },
        ]}
      />
      <div className="mt-5">
        {tab === "details" && <DetailsTab location={location} canManage={canManage} isGlobal={isGlobal} />}
        {tab === "photos" && <PhotosTab location={location} canManage={canManage} />}
        {tab === "hours" && <HoursTab location={location} canManage={canManage} />}
        {tab === "facilities" && <FacilitiesTab location={location} canManage={canManage} />}
        {tab === "policy" && <PolicyTab location={location} canManage={canManage} />}
        {tab === "pricing" && <PricingTab location={location} courts={courts} rules={rules} canPrice={canPrice} />}
      </div>
    </AdminShell>
  );
}

function useSave() {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  async function save<T>(label: string, fn: () => Promise<{ ok: true; data: T } | { ok: false; message: string; fields?: Record<string, string> }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.ok) {
      setFields({});
      toast({ tone: "success", title: label });
      router.refresh();
      return true;
    }
    setFields(res.fields ?? {});
    toast({ tone: "danger", title: res.message });
    return false;
  }
  return { busy, fields, save };
}

/* ------------------------------------------------------------------ Details */

function DetailsTab({ location, canManage, isGlobal }: { location: LocationView; canManage: boolean; isGlobal: boolean }) {
  const { busy, fields, save } = useSave();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input: Record<string, unknown> = {};
    for (const k of ["name", "slug", "city", "area", "address", "description", "timezone", "phone", "email"]) input[k] = String(f.get(k) ?? "");
    if (isGlobal) input.status = String(f.get("status"));
    const lat = String(f.get("latitude") ?? "");
    const lng = String(f.get("longitude") ?? "");
    input.latitude = lat === "" ? null : Number(lat);
    input.longitude = lng === "" ? null : Number(lng);
    await save("Location saved", () => updateLocationAction(location.id, input));
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={!canManage} className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={fields.name}>{(id) => <Input id={id} name="name" defaultValue={location.name} required invalid={!!fields.name} />}</Field>
          <Field label="Slug" hint="Used in links" error={fields.slug}>{(id) => <Input id={id} name="slug" defaultValue={location.slug} required invalid={!!fields.slug} />}</Field>
          <Field label="City" error={fields.city}>{(id) => <Input id={id} name="city" defaultValue={location.city} required invalid={!!fields.city} />}</Field>
          <Field label="Area" error={fields.area}>{(id) => <Input id={id} name="area" defaultValue={location.area} required invalid={!!fields.area} />}</Field>
          <Field label="Address" className="sm:col-span-2" error={fields.address}>{(id) => <Input id={id} name="address" defaultValue={location.address} required invalid={!!fields.address} />}</Field>
          <Field label="Description" className="sm:col-span-2" hint="Shown to players on the location page." error={fields.description}>
            {(id) => <Textarea id={id} name="description" defaultValue={location.description ?? ""} maxLength={2000} placeholder="What makes this club special?" invalid={!!fields.description} />}
          </Field>
        </Card>
        <div className="space-y-4">
          <Card className="space-y-4">
            <Field label="Status" hint={isGlobal ? "Inactive locations are hidden from players." : "Only academy owners change status."}>
              {(id) => <Select id={id} name="status" defaultValue={location.status} disabled={!isGlobal} options={LOCATION_STATUSES.map((s) => ({ value: s.value, label: s.label }))} />}
            </Field>
            <Field label="Timezone" hint="All court hours and closures use this zone." error={fields.timezone}>
              {(id) => <Select id={id} name="timezone" defaultValue={location.timezone} options={[...new Set([location.timezone, ...TIMEZONES])].map((t) => ({ value: t, label: t }))} />}
            </Field>
            <Field label="Phone" error={fields.phone}>{(id) => <Input id={id} name="phone" type="tel" defaultValue={location.phone ?? ""} invalid={!!fields.phone} />}</Field>
            <Field label="Email" error={fields.email}>{(id) => <Input id={id} name="email" type="email" defaultValue={location.email ?? ""} invalid={!!fields.email} />}</Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude" error={fields.latitude}>{(id) => <Input id={id} name="latitude" type="number" step="any" defaultValue={location.latitude ?? ""} invalid={!!fields.latitude} />}</Field>
              <Field label="Longitude" error={fields.longitude}>{(id) => <Input id={id} name="longitude" type="number" step="any" defaultValue={location.longitude ?? ""} invalid={!!fields.longitude} />}</Field>
            </div>
          </Card>
          {canManage && (
            <Button type="submit" loading={busy} fullWidth>
              Save details
            </Button>
          )}
        </div>
      </fieldset>
    </form>
  );
}

/* ------------------------------------------------------------------ Photos */

function PhotosTab({ location, canManage }: { location: LocationView; canManage: boolean }) {
  const { busy, save } = useSave();
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const photos = location.photos;

  async function move(i: number, dir: -1 | 1) {
    const ids = photos.map((p) => p.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await save("Order updated", () => reorderLocationPhotosAction(location.id, ids));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div>
        {photos.length === 0 ? (
          <EmptyState icon={<ImagePlus />} title="No photos yet" description="Add photos from the brand library or paste an https URL." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {photos.map((p, i) => (
              <Card key={p.id} padding="none" className="group">
                <div className="relative h-40">
                  <Image src={p.url} alt={p.alt ?? ""} fill sizes="400px" className="object-cover" unoptimized={p.url.startsWith("http")} />
                  {i === 0 && <Badge tone="brand" className="absolute left-3 top-3">Cover</Badge>}
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="truncate text-caption text-fg-muted">{p.alt || p.url}</span>
                  {canManage && (
                    <div className="flex shrink-0 gap-1">
                      <IconButton size="sm" variant="ghost" label="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)}>
                        <ArrowUp />
                      </IconButton>
                      <IconButton size="sm" variant="ghost" label="Move down" disabled={busy || i === photos.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDown />
                      </IconButton>
                      <IconButton size="sm" variant="ghost" label="Remove photo" className="text-danger hover:bg-danger/10" disabled={busy} onClick={() => save("Photo removed", () => removeLocationPhotoAction(location.id, p.id))}>
                        <Trash2 />
                      </IconButton>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      {canManage && (
        <Card className="space-y-4 self-start">
          <CardHeader title="Add a photo" description="Uploading from your computer is coming soon. For now, pick a brand photo or paste a link." />
          <div className="grid grid-cols-2 gap-2">
            {BRAND_PHOTOS.map((b) => (
              <button key={b.url} type="button" onClick={() => { setUrl(b.url); setAlt(b.alt); }} className={`relative h-20 overflow-hidden rounded-md border transition-all ${url === b.url ? "border-blue-400 shadow-glow-sm" : "border-line/10 hover:border-line/30"}`} aria-label={b.alt}>
                <Image src={b.url} alt={b.alt} fill sizes="200px" className="object-cover" />
              </button>
            ))}
          </div>
          <Field label="Photo URL">{(id) => <Input id={id} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… or /brand/…" />}</Field>
          <Field label="Alt text">{(id) => <Input id={id} value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Describe the photo" />}</Field>
          <Button leftIcon={<Plus />} loading={busy} disabled={!url} fullWidth onClick={async () => { if (await save("Photo added", () => addLocationPhotoAction(location.id, { url, alt: alt || undefined }))) { setUrl(""); setAlt(""); } }}>
            Add photo
          </Button>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Hours */

function HoursTab({ location, canManage }: { location: LocationView; canManage: boolean }) {
  const { busy, save } = useSave();
  const [hours, setHours] = useState<OpeningHours>((location.openingHours as OpeningHours | null) ?? DEFAULT_HOURS);
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <OpeningHoursEditor value={hours} onChange={setHours} disabled={!canManage} />
      <div className="space-y-4 self-start">
        <Alert tone="info" title="How hours apply">
          Location hours cap every court&apos;s weekly template. A court cannot offer slots outside these hours even if its own template is wider. Times are in {location.timezone}.
        </Alert>
        {canManage && (
          <Button loading={busy} fullWidth onClick={() => save("Opening hours saved", () => updateLocationAction(location.id, { openingHours: hours }))}>
            Save opening hours
          </Button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Facilities */

function FacilitiesTab({ location, canManage }: { location: LocationView; canManage: boolean }) {
  const { busy, save } = useSave();
  const [selected, setSelected] = useState<string[]>(location.facilities);
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <div className="flex flex-wrap gap-2">
          {FACILITIES.map((f) => (
            <Chip key={f.key} selected={selected.includes(f.key)} disabled={!canManage} onClick={() => setSelected((s) => (s.includes(f.key) ? s.filter((k) => k !== f.key) : [...s, f.key]))}>
              {f.label}
            </Chip>
          ))}
        </div>
      </Card>
      {canManage && (
        <Button loading={busy} className="self-start" fullWidth onClick={() => save("Facilities saved", () => updateLocationAction(location.id, { facilities: selected }))}>
          Save facilities
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Policy */

function PolicyTab({ location, canManage }: { location: LocationView; canManage: boolean }) {
  const { busy, fields, save } = useSave();
  const p = location.bookingPolicy;
  const [durations, setDurations] = useState<number[]>(p?.allowedDurations ?? [60, 90, 120]);
  const [verified, setVerified] = useState(p?.requireVerifiedEmail ?? true);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await save("Booking policy saved", () =>
      upsertBookingPolicyAction(location.id, {
        advanceBookingDays: f.get("advanceBookingDays"),
        minNoticeMinutes: f.get("minNoticeMinutes"),
        cancellationCutoffHours: f.get("cancellationCutoffHours"),
        maxActiveBookingsPerPlayer: f.get("maxActiveBookingsPerPlayer"),
        requireVerifiedEmail: verified,
        allowedDurations: durations,
      }),
    );
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={!canManage} className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="grid gap-4 sm:grid-cols-2">
          <Field label="Booking window (days ahead)" error={fields.advanceBookingDays}>{(id) => <Input id={id} name="advanceBookingDays" type="number" min={1} max={365} defaultValue={p?.advanceBookingDays ?? 14} />}</Field>
          <Field label="Minimum notice (minutes)" error={fields.minNoticeMinutes}>{(id) => <Input id={id} name="minNoticeMinutes" type="number" min={0} defaultValue={p?.minNoticeMinutes ?? 60} />}</Field>
          <Field label="Free cancellation until (hours before)" error={fields.cancellationCutoffHours}>{(id) => <Input id={id} name="cancellationCutoffHours" type="number" min={0} defaultValue={p?.cancellationCutoffHours ?? 12} />}</Field>
          <Field label="Max active bookings per player" error={fields.maxActiveBookingsPerPlayer}>{(id) => <Input id={id} name="maxActiveBookingsPerPlayer" type="number" min={1} max={50} defaultValue={p?.maxActiveBookingsPerPlayer ?? 3} />}</Field>
          <div className="sm:col-span-2">
            <div className="mb-2 text-body-sm font-semibold text-fg-muted">Allowed durations</div>
            <div className="flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((d) => (
                <Chip key={d} selected={durations.includes(d)} disabled={!canManage} onClick={() => setDurations((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d].sort((a, b) => a - b)))}>
                  {d} min
                </Chip>
              ))}
            </div>
            {fields.allowedDurations && <p className="mt-1 text-caption text-danger">{fields.allowedDurations}</p>}
          </div>
          <div className="sm:col-span-2">
            <Switch label="Require verified email to book" description="Unverified accounts can browse but not reserve." checked={verified} onChange={setVerified} disabled={!canManage} />
          </div>
        </Card>
        <div className="space-y-4 self-start">
          <Alert tone="info" title="How these limits work">
            Slots inside the minimum notice or beyond the booking window are shown but not bookable. Cancellation and booking limits apply to every new booking.
          </Alert>
          {canManage && (
            <Button type="submit" loading={busy} fullWidth>
              Save policy
            </Button>
          )}
        </div>
      </fieldset>
    </form>
  );
}

/* ------------------------------------------------------------------ Pricing */

const kindTone = (k: PricingRule["kind"]) => (k === "PEAK" ? "warning" : k === "MEMBERSHIP_DISCOUNT" ? "volt" : k === "OFF_PEAK" ? "success" : "brand");

function PricingTab({ location, courts, rules, canPrice }: { location: LocationView; courts: { id: string; name: string }[]; rules: PricingRule[]; canPrice: boolean }) {
  const { busy, fields, save } = useSave();
  const [editing, setEditing] = useState<PricingRule | "new" | null>(null);
  const [deleting, setDeleting] = useState<PricingRule | null>(null);
  const describe = (r: PricingRule) => {
    const parts: string[] = [];
    if (r.daysOfWeek.length) parts.push(r.daysOfWeek.map((d) => DAY_SHORT[d]).join(", "));
    else parts.push("Every day");
    if (r.startsAt != null && r.endsAt != null) parts.push(`${minutesToHHMM(r.startsAt)}–${minutesToHHMM(r.endsAt)}`);
    if (r.courtId) parts.push(courts.find((c) => c.id === r.courtId)?.name ?? "one court");
    if (r.membershipTier) parts.push(`tier ${r.membershipTier}`);
    return parts.join(" · ");
  };
  const amount = (r: PricingRule) => (r.priceCents != null ? `EGP ${Math.round(r.priceCents / 100)}/h` : `${r.adjustmentPercent! > 0 ? "+" : ""}${r.adjustmentPercent}%`);

  return (
    <div className="space-y-4">
      <Alert tone="info" title="How pricing works">
        Each court&apos;s weekly template sets a base hourly rate. Rules below adjust it in priority order (lowest first): an absolute price replaces the base, a percentage scales the running total. Peak, off-peak, weekend and membership discounts are all rules, so you can add a new scheme at any time.
      </Alert>
      <div className="flex items-center justify-between">
        <div className="text-h4">{rules.length} rule{rules.length === 1 ? "" : "s"}</div>
        {canPrice && (
          <Button leftIcon={<Plus />} onClick={() => setEditing("new")}>
            Add rule
          </Button>
        )}
      </div>
      {rules.length === 0 ? (
        <EmptyState icon={<Tag />} title="No pricing rules" description="Players pay the base hourly rate from each court's template." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rules.map((r) => (
            <Card key={r.id} padding="sm" className={r.active ? "" : "opacity-60"}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-body font-bold">{r.name}</span>
                    <Badge tone={kindTone(r.kind)} size="sm">
                      {PRICING_KINDS.find((k) => k.value === r.kind)?.label}
                    </Badge>
                    {!r.active && <Badge size="sm">Inactive</Badge>}
                  </div>
                  <div className="mt-1 text-caption text-fg-muted">{describe(r)}</div>
                  <div className="mt-0.5 text-caption text-fg-subtle">Priority {r.priority}</div>
                </div>
                <div className="text-right">
                  <div className="text-h4 tabular">{amount(r)}</div>
                  {canPrice && (
                    <div className="mt-1 flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                        Edit
                      </Button>
                      <IconButton size="sm" variant="ghost" label="Delete rule" className="text-danger hover:bg-danger/10" onClick={() => setDeleting(r)}>
                        <Trash2 />
                      </IconButton>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <RuleModal
          rule={editing === "new" ? null : editing}
          courts={courts}
          busy={busy}
          fields={fields}
          onClose={() => setEditing(null)}
          onSubmit={async (input) => {
            const ok = await save(editing === "new" ? "Rule created" : "Rule updated", () => (editing === "new" ? createPricingRuleAction(location.id, input) : updatePricingRuleAction(location.id, editing.id, input)));
            if (ok) setEditing(null);
          }}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        tone="danger"
        title={`Delete "${deleting?.name}"?`}
        description="Prices will no longer include this adjustment."
        confirmLabel="Delete rule"
        loading={busy}
        onConfirm={async () => {
          if (deleting) await save("Rule deleted", () => deletePricingRuleAction(location.id, deleting.id));
          setDeleting(null);
        }}
      />
    </div>
  );
}

function RuleModal({ rule, courts, busy, fields, onClose, onSubmit }: { rule: PricingRule | null; courts: { id: string; name: string }[]; busy: boolean; fields: Record<string, string>; onClose: () => void; onSubmit: (input: Record<string, unknown>) => void }) {
  const [kind, setKind] = useState<PricingRule["kind"]>(rule?.kind ?? "PEAK");
  const [days, setDays] = useState<number[]>(rule?.daysOfWeek ?? (kind === "WEEKEND" ? [5, 6] : []));
  const [timed, setTimed] = useState(rule ? rule.startsAt != null : kind === "PEAK");
  const [startsAt, setStartsAt] = useState(rule?.startsAt ?? 18 * 60);
  const [endsAt, setEndsAt] = useState(rule?.endsAt ?? 21 * 60);
  const [mode, setMode] = useState<"percent" | "absolute">(rule?.priceCents != null ? "absolute" : "percent");
  const [active, setActive] = useState(rule?.active ?? true);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    onSubmit({
      name: f.get("name"),
      kind,
      courtId: String(f.get("courtId") ?? "") || null,
      daysOfWeek: days,
      startsAt: timed ? startsAt : null,
      endsAt: timed ? endsAt : null,
      priceCents: mode === "absolute" ? Math.round(Number(f.get("price")) * 100) : null,
      adjustmentPercent: mode === "percent" ? Number(f.get("percent")) : null,
      membershipTier: kind === "MEMBERSHIP_DISCOUNT" ? String(f.get("membershipTier") ?? "") || null : null,
      priority: f.get("priority"),
      active,
    });
  }

  return (
    <Modal open onClose={onClose} title={rule ? "Edit pricing rule" : "New pricing rule"} size="lg">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={fields.name}>{(id) => <Input id={id} name="name" defaultValue={rule?.name ?? ""} required placeholder="Peak hours" invalid={!!fields.name} />}</Field>
        <Field label="Kind">
          {(id) => (
            <Select
              id={id}
              value={kind}
              onChange={(e) => {
                const k = e.target.value as PricingRule["kind"];
                setKind(k);
                if (k === "WEEKEND" && days.length === 0) setDays([5, 6]);
                if (k === "PEAK" || k === "OFF_PEAK") setTimed(true);
              }}
              options={PRICING_KINDS.map((k) => ({ value: k.value, label: k.label }))}
            />
          )}
        </Field>
        <Field label="Applies to" className="sm:col-span-2">
          {(id) => <Select id={id} name="courtId" defaultValue={rule?.courtId ?? ""} options={[{ value: "", label: "All courts at this location" }, ...courts.map((c) => ({ value: c.id, label: c.name }))]} />}
        </Field>
        <div className="sm:col-span-2">
          <div className="mb-2 text-body-sm font-semibold text-fg-muted">Days (none = every day)</div>
          <div className="flex flex-wrap gap-2">
            {DAY_SHORT.map((d, i) => (
              <Chip key={d} selected={days.includes(i)} onClick={() => setDays((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i].sort()))}>
                {d}
              </Chip>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <Switch label="Limit to a time window" checked={timed} onChange={setTimed} />
          {timed && (
            <div className="mt-3 flex items-center gap-2">
              <TimeSelect value={startsAt} onChange={setStartsAt} max={23 * 60 + 30} aria-label="Window start" />
              <span className="text-caption text-fg-subtle">to</span>
              <TimeSelect value={endsAt} onChange={setEndsAt} min={30} aria-label="Window end" />
              {fields.endsAt && <span className="text-caption text-danger">{fields.endsAt}</span>}
            </div>
          )}
        </div>
        <Field label="Adjustment">
          {() => (
            <Tabs
              variant="pill"
              fullWidth
              value={mode}
              onChange={setMode}
              items={[
                { value: "percent", label: "Percentage" },
                { value: "absolute", label: "Fixed hourly" },
              ]}
            />
          )}
        </Field>
        {mode === "percent" ? (
          <Field label="Percent (negative = discount)" error={fields.adjustmentPercent ?? fields.priceCents}>{(id) => <Input id={id} name="percent" type="number" min={-100} max={300} defaultValue={rule?.adjustmentPercent ?? (kind === "MEMBERSHIP_DISCOUNT" ? -15 : 25)} required />}</Field>
        ) : (
          <Field label="Hourly price (EGP)" error={fields.priceCents}>{(id) => <Input id={id} name="price" type="number" min={0} step={1} defaultValue={rule?.priceCents != null ? Math.round(rule.priceCents / 100) : 500} required />}</Field>
        )}
        {kind === "MEMBERSHIP_DISCOUNT" && (
          <Field label="Membership tier" hint="Leave empty for any member." error={fields.membershipTier}>{(id) => <Input id={id} name="membershipTier" defaultValue={rule?.membershipTier ?? "PRO"} placeholder="PRO" />}</Field>
        )}
        <Field label="Priority" hint="Lower runs first." error={fields.priority}>{(id) => <Input id={id} name="priority" type="number" min={0} max={1000} defaultValue={rule?.priority ?? 100} />}</Field>
        <div className="flex items-center sm:col-span-2">
          <Checkbox label="Active" checked={active} onChange={(e) => setActive(e.target.checked)} />
        </div>
        <div className="flex justify-end gap-2 pb-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {rule ? "Save rule" : "Create rule"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
