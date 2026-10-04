"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, RotateCcw, Save, Send } from "lucide-react";
import type { NotificationCategory, NotificationChannel } from "@prisma/client";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, SectionHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox, StatTile } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { CATEGORY_LABEL, CHANNELS, NOTIFICATION_CATEGORIES, render } from "@/lib/notifications";
import { resetTemplateAction, sendAnnouncementAction, updateTemplateAction } from "@/server/actions/notifications";
import { count } from "@/lib/text";

export type TemplateDto = {
  type: string;
  category: NotificationCategory;
  title: string;
  body: string;
  enabled: boolean;
  channels: NotificationChannel[];
  vars: string[];
  defaults: { title: string; body: string } | null;
  updatedBy: string | null;
};

export type DeliveryStat = { channel: NotificationChannel; status: string; count: number; live: boolean };

type Tab = "templates" | "announce" | "delivery";

export function NotificationsView({
  templates,
  stats,
  locations,
  canConfigure,
  canAnnounce,
  academyWide,
}: {
  templates: TemplateDto[];
  stats: DeliveryStat[];
  locations: { id: string; name: string }[];
  canConfigure: boolean;
  canAnnounce: boolean;
  academyWide: boolean;
}) {
  const [tab, setTab] = useState<Tab>(canConfigure ? "templates" : "announce");
  const items: { value: Tab; label: string }[] = [
    ...(canConfigure ? ([{ value: "templates" as Tab, label: "Templates" }] as const) : []),
    ...(canAnnounce ? ([{ value: "announce" as Tab, label: "Announcement" }] as const) : []),
    ...(canConfigure ? ([{ value: "delivery" as Tab, label: "Delivery" }] as const) : []),
  ];

  return (
    <AdminShell title="Notifications" breadcrumb={["Communication", "Notifications"]}>
      <div className="space-y-5">
        <Tabs items={items} value={tab} onChange={setTab} />
        {tab === "templates" && <Templates templates={templates} />}
        {tab === "announce" && <Announcement locations={locations} academyWide={academyWide} />}
        {tab === "delivery" && <Delivery stats={stats} />}
      </div>
    </AdminShell>
  );
}

/* ------------------------------------------------------------------ Templates */

function Templates({ templates }: { templates: TemplateDto[] }) {
  const [category, setCategory] = useState<NotificationCategory>("BOOKING");
  const rows = useMemo(() => templates.filter((t) => t.category === category), [templates, category]);
  return (
    <div className="space-y-4">
      <Alert tone="info" title="Wording players actually see">
        Every notification HITTERS sends is listed here. Edit the text, switch a channel off, or disable a type entirely. Placeholders in double braces are filled at send time; only the ones listed under each
        template are available.
      </Alert>
      <div className="flex flex-wrap gap-2">
        {NOTIFICATION_CATEGORIES.map((c) => (
          <Button key={c.value} size="sm" variant={c.value === category ? "primary" : "secondary"} onClick={() => setCategory(c.value)}>
            {c.label}
            <Badge tone="neutral">{templates.filter((t) => t.category === c.value).length}</Badge>
          </Button>
        ))}
      </div>
      <div className="space-y-3">
        {rows.map((t) => (
          <TemplateCard key={t.type} template={t} />
        ))}
      </div>
    </div>
  );
}

const SAMPLE: Record<string, string> = {
  code: "HT-4821",
  club: "HITTERS New Cairo",
  court: "Court 3",
  when: "Sat 11 Oct, 19:00",
  duration: "90",
  organizer: "Omar H.",
  player: "Nadia K.",
  coach: "Coach Yasmin",
  program: "Intermediate Academy",
  package: "10-lesson pack",
  level: "B",
  label: "Intermediate",
  accepted: "3",
  max: "4",
  spots: "1",
  spotsPlural: "",
  credits: "10",
  creditsPlural: "s",
  position: "2",
  reasons: "Exact level match · Your home club",
  thread: "Game HT-4821",
  sender: "Nadia",
  excerpt: "Can someone bring an extra ball?",
  title: "Courts closed Friday morning",
  body: "Resurfacing work finishes at noon.",
  reason: "The coach is unwell.",
  role: "receptionist",
  headline: "New lesson with Nadia K.",
  expires: "2027-04-01",
  startsOn: "11 Oct",
  sessions: "8",
  enrolled: "6",
  capacity: "8",
  verb: "enrolled in",
  summary: "The Tuesday session moved to 20:00.",
  assessor: "Coach Yasmin",
  kind: "Assessed",
};

/** "game.request_waitlisted" reads as "Games and matchmaking: request waitlisted" for the card heading. */
function templateTitle(type: string): string {
  const [group, ...rest] = type.split(".");
  const action = rest.join(" ").replace(/_/g, " ");
  const groupName: Record<string, string> = {
    booking: "Booking",
    game: "Game",
    match: "Match",
    pair: "Pair",
    lesson: "Lesson",
    program: "Program",
    package: "Package",
    training: "Training",
    trainer: "Coach",
    assessment: "Assessment",
    academy: "Academy",
    staff: "Staff",
    message: "Message",
  };
  const label = `${groupName[group] ?? group} ${action}`.trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function TemplateCard({ template }: { template: TemplateDto }) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState(template.title);
  const [body, setBody] = useState(template.body);
  const [enabled, setEnabled] = useState(template.enabled);
  const [channels, setChannels] = useState<NotificationChannel[]>(template.channels);
  const [pending, start] = useTransition();
  const dirty = title !== template.title || body !== template.body || enabled !== template.enabled || channels.join() !== template.channels.join();

  const preview = { title: render(title, SAMPLE), body: render(body, SAMPLE) };

  return (
    <Card>
      <CardHeader
        title={templateTitle(template.type)}
        description={`${template.type} · ${template.updatedBy ? `edited by ${template.updatedBy}` : "using the HITTERS default wording"}`}
        action={
          <div className="flex items-center gap-2">
            {!enabled && <Badge tone="danger">Off</Badge>}
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<RotateCcw />}
              loading={pending}
              onClick={() =>
                start(async () => {
                  const res = await resetTemplateAction(template.type);
                  if (res.ok) {
                    toast({ tone: "success", title: "Reset to the default" });
                    router.refresh();
                  } else toast({ tone: "danger", title: res.message });
                })
              }
            >
              Reset
            </Button>
          </div>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Title">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
          <Field label="Body" hint={template.vars.length ? `Placeholders: ${template.vars.map((v) => `{{${v}}}`).join(" ")}` : "This type takes no placeholders."}>
            {(id, describedBy) => <Textarea id={id} aria-describedby={describedBy} rows={3} value={body} onChange={(e) => setBody(e.target.value)} />}
          </Field>
          <div className="flex flex-wrap items-center gap-4">
            {CHANNELS.map((ch) => (
              <Checkbox
                key={ch.value}
                label={ch.live ? ch.label : `${ch.label} (soon)`}
                checked={channels.includes(ch.value)}
                onChange={(e) => setChannels((prev) => (e.target.checked ? [...prev, ch.value] : prev.filter((c) => c !== ch.value)))}
              />
            ))}
            <Checkbox label="Enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-lg border border-line/10 bg-surface-2 p-3.5">
            <div className="text-overline uppercase text-blue-300/70">Preview</div>
            <div className="mt-2 text-body-sm font-bold text-fg">{preview.title}</div>
            <p className="mt-1 text-body-sm text-fg-muted">{preview.body}</p>
          </div>
          <Button
            size="sm"
            leftIcon={<Save />}
            disabled={!dirty || channels.length === 0}
            loading={pending}
            onClick={() =>
              start(async () => {
                const res = await updateTemplateAction(template.type, { title, body, enabled, channels });
                if (res.ok) {
                  toast({ tone: "success", title: "Template saved" });
                  router.refresh();
                } else toast({ tone: "danger", title: "Nothing was saved", description: res.message });
              })
            }
          >
            Save template
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ Announcement */

function Announcement({ locations, academyWide }: { locations: { id: string; name: string }[]; academyWide: boolean }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [locationId, setLocationId] = useState(academyWide ? "" : (locations[0]?.id ?? ""));
  const [audience, setAudience] = useState("PLAYERS");
  const [pending, start] = useTransition();
  const [sent, setSent] = useState<{ sent: number; recipients: number } | null>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Academy announcement" description="Goes to the notification center of everyone you can reach, and to email once that channel is connected." />
        <div className="space-y-4">
          <Field label="Title" required>
            {(id) => <Input id={id} value={title} maxLength={120} placeholder="Courts closed Friday morning" onChange={(e) => setTitle(e.target.value)} />}
          </Field>
          <Field label="Message" required>
            {(id) => <Textarea id={id} rows={5} value={body} maxLength={1000} placeholder="Resurfacing work finishes at noon. Bookings before 12:00 move to New Cairo." onChange={(e) => setBody(e.target.value)} />}
          </Field>
          <Field label="Club" hint={academyWide ? "Leave empty to reach the whole academy." : "You can message your own clubs."}>
            {(id) => (
              <Select
                id={id}
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                placeholder={academyWide ? "Everyone in the academy" : undefined}
                options={locations.map((l) => ({ value: l.id, label: l.name }))}
              />
            )}
          </Field>
          <Field label="Audience">
            {(id) => (
              <Select
                id={id}
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                options={[
                  { value: "PLAYERS", label: "Players" },
                  { value: "STAFF", label: "Staff" },
                  { value: "EVERYONE", label: "Players and staff" },
                ]}
              />
            )}
          </Field>
          <Button
            fullWidth
            leftIcon={<Send />}
            loading={pending}
            disabled={title.trim().length < 3 || body.trim().length < 3}
            onClick={() =>
              start(async () => {
                const res = await sendAnnouncementAction({ title, body, audience, ...(locationId ? { locationId } : {}) });
                if (res.ok) {
                  setSent(res.data);
                  setTitle("");
                  setBody("");
                  toast({ tone: "success", title: `Sent to ${count(res.data.sent, "person", "people")}` });
                } else toast({ tone: "danger", title: "Nothing was sent", description: res.message });
              })
            }
          >
            Send announcement
          </Button>
        </div>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Preview" />
          <div className="flex gap-3 rounded-lg border border-blue-400/30 bg-blue-500/10 p-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand-gradient text-white [&_svg]:size-5">
              <Megaphone />
            </span>
            <div className="min-w-0">
              <div className="text-body-sm font-bold text-fg">{title || "Your title"}</div>
              <p className="mt-0.5 text-body-sm text-fg-muted">{body || "Your message appears here."}</p>
            </div>
          </div>
        </Card>
        {sent && (
          <Alert tone="success" title="Announcement sent">
            {sent.sent} of {sent.recipients} people received it. The rest have muted academy announcements, which HITTERS respects.
          </Alert>
        )}
        <Alert tone="warning" title="Use it sparingly">
          Announcements bypass grouping because they are rare by design. Anything routine belongs in a template so players can mute it per category.
        </Alert>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Delivery */

function Delivery({ stats }: { stats: DeliveryStat[] }) {
  const byChannel = CHANNELS.map((ch) => {
    const rows = stats.filter((s) => s.channel === ch.value);
    const total = rows.reduce((n, r) => n + r.count, 0);
    const get = (status: string) => rows.find((r) => r.status === status)?.count ?? 0;
    return { ...ch, total, sent: get("SENT"), pending: get("PENDING") + get("SENDING"), failed: get("FAILED"), skipped: get("SKIPPED") };
  });
  return (
    <div className="space-y-5">
      <Alert tone="info" title="How delivery works">
        In-app delivery is immediate. Email, push and SMS rows are written the moment a notification is created and stay pending until a provider is registered, so nothing is lost when a channel is switched on
        later.
      </Alert>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {byChannel.map((c) => (
          <StatTile key={c.value} label={c.label} value={c.total} delta={{ value: c.live ? "Delivering now" : "Ready, needs a provider", positive: c.live }} />
        ))}
      </div>
      <section>
        <SectionHeader title="Breakdown" />
        <Card padding="none">
          <table className="w-full text-body-sm">
            <thead className="border-b border-line/10 text-left text-caption uppercase text-fg-subtle">
              <tr>
                <th className="p-3">Channel</th>
                <th className="p-3">Sent</th>
                <th className="p-3">Pending</th>
                <th className="p-3">Failed</th>
                <th className="p-3">Skipped</th>
              </tr>
            </thead>
            <tbody>
              {byChannel.map((c) => (
                <tr key={c.value} className="border-b border-line/5 last:border-0">
                  <td className="p-3 font-semibold text-fg">{c.label}</td>
                  <td className="p-3 text-fg-muted">{c.sent}</td>
                  <td className="p-3 text-fg-muted">{c.pending}</td>
                  <td className="p-3 text-fg-muted">{c.failed}</td>
                  <td className="p-3 text-fg-muted">{c.skipped}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
