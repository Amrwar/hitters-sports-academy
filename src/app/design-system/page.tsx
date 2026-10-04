"use client";

import { useState } from "react";
import { Bell, CalendarPlus, Mail, Plus, Search, Swords, Trash2 } from "lucide-react";
import { AppIcon, Lockup, Monogram, Wordmark } from "@/components/brand/Logo";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dropdown } from "@/components/ui/dropdown";
import { Card, CardHeader, SectionHeader } from "@/components/ui/card";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { TBody, TD, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { Badge, LevelBadge, StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import { Avatar, AvatarGroup } from "@/components/ui/avatar";
import { Calendar, DateStrip } from "@/components/ui/calendar";
import { ConfirmationState, EmptyState, ErrorState, LoadingState, SkeletonCard } from "@/components/ui/states";
import { Checkbox, Chip, Divider, ProgressBar, StatTile, Switch } from "@/components/ui/misc";
import { LEVELS } from "@/lib/tokens";

const swatches = [
  { name: "navy-950", cls: "bg-navy-950", hex: "#030712" },
  { name: "navy-900", cls: "bg-navy-900", hex: "#050B24" },
  { name: "navy-800", cls: "bg-navy-800", hex: "#0A1540" },
  { name: "navy-700", cls: "bg-navy-700", hex: "#10205C" },
  { name: "blue-700 royal", cls: "bg-blue-700", hex: "#0B2FD6" },
  { name: "blue-500 electric", cls: "bg-blue-500", hex: "#2563FF" },
  { name: "blue-400", cls: "bg-blue-400", hex: "#4D82FF" },
  { name: "blue-300 light", cls: "bg-blue-300", hex: "#7FA6FF" },
  { name: "blue-200", cls: "bg-blue-200", hex: "#B4C9FF" },
  { name: "white", cls: "bg-white", hex: "#FFFFFF" },
  { name: "volt", cls: "bg-volt", hex: "#D4F23C" },
  { name: "success", cls: "bg-success", hex: "#22C55E" },
  { name: "warning", cls: "bg-warning", hex: "#F5A524" },
  { name: "danger", cls: "bg-danger", hex: "#F43F5E" },
];

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <SectionHeader title={title} eyebrow={id} />
      {description && <p className="-mt-1 mb-4 text-body-sm text-fg-muted">{description}</p>}
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState("one");
  const [pill, setPill] = useState("Solo");
  const [sw, setSw] = useState(true);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [strip, setStrip] = useState(new Date());
  const [chip, setChip] = useState("B");

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line/10 bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3 text-white">
            <Monogram height={20} glow />
            <span className="text-body font-bold">Design system</span>
          </div>
          <nav className="hidden gap-1 md:flex">
            {["brand", "color", "type", "buttons", "forms", "cards", "feedback", "data", "states"].map((s) => (
              <a key={s} href={`#${s}`} className="rounded-full px-3 py-1.5 text-body-sm font-semibold capitalize text-fg-muted hover:bg-line/5 hover:text-fg">
                {s}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-16 px-4 py-10 sm:px-6">
        <Section id="brand" title="Brand marks" description="Vector-traced from the official references. Use currentColor; never recolor the geometry or alter its proportions.">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="flex flex-col items-center justify-center gap-6 py-10 text-white court-line">
              <Lockup height={26} glow />
              <span className="text-caption text-fg-muted">Lockup · glow</span>
            </Card>
            <Card variant="brand" className="flex flex-col items-center justify-center gap-6 py-10">
              <Wordmark height={22} />
              <span className="text-caption text-white/70">Wordmark on brand gradient</span>
            </Card>
            <Card className="flex items-center justify-around py-10 text-white">
              <Monogram height={48} glow />
              <AppIcon size={72} />
              <div className="flex size-10 items-center justify-center rounded-md bg-white text-blue-700">
                <Monogram height={14} />
              </div>
            </Card>
          </div>
        </Section>

        <Section id="color" title="Color tokens" description="Brand primitives plus semantic surfaces. Dark is the default theme; the admin content area switches to light via data-theme.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {swatches.map((s) => (
              <div key={s.name} className="overflow-hidden rounded-md border border-line/10">
                <div className={`h-16 ${s.cls}`} />
                <div className="bg-surface-1 p-2">
                  <div className="text-caption font-bold">{s.name}</div>
                  <div className="text-[11px] tabular text-fg-subtle">{s.hex}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-canvas p-4 ring-1 ring-line/10">
              <div className="text-caption font-bold text-fg-muted">Dark surface hierarchy</div>
              <div className="mt-3 rounded-md bg-surface-1 p-3 ring-1 ring-line/10">
                surface-1 · cards
                <div className="mt-2 rounded-md bg-surface-2 p-3 ring-1 ring-line/10">
                  surface-2 · inputs, nested
                  <div className="mt-2 rounded-md bg-surface-3 p-3 ring-1 ring-line/10">surface-3 · popovers, modals</div>
                </div>
              </div>
            </div>
            <div data-theme="light" className="rounded-lg bg-canvas p-4 text-fg ring-1 ring-line/10">
              <div className="text-caption font-bold text-fg-muted">Light surface hierarchy (admin)</div>
              <div className="mt-3 rounded-md bg-surface-1 p-3 ring-1 ring-line/10 shadow-light-md">
                surface-1 · cards
                <div className="mt-2 rounded-md bg-surface-2 p-3 ring-1 ring-line/10">
                  surface-2 · inputs, nested
                  <div className="mt-2 rounded-md bg-surface-3 p-3 ring-1 ring-line/10 shadow-light-md">surface-3 · popovers, modals</div>
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section id="type" title="Typography" description="Manrope throughout. Display and headings use tight tracking and 700–800 weights; numbers use tabular figures.">
          <Card className="space-y-4">
            <div className="text-display-xl">Display XL · 56</div>
            <div className="text-display">Display · 40</div>
            <h1 className="text-h1">Heading 1 · 32</h1>
            <h2 className="text-h2">Heading 2 · 24</h2>
            <h3 className="text-h3">Heading 3 · 20</h3>
            <h4 className="text-h4">Heading 4 · 18</h4>
            <p className="text-body-lg">Body large · 16 — Book courts, find your match, hit harder.</p>
            <p className="text-body">Body · 15 — Book courts, find your match, hit harder.</p>
            <p className="text-body-sm text-fg-muted">Body small · 14 — muted text for secondary information.</p>
            <p className="text-caption text-fg-subtle">Caption · 12 — timestamps and helper text.</p>
            <p className="text-overline uppercase text-blue-300">Overline · 11 · tracking 0.12em</p>
          </Card>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Card padding="sm">
              <div className="text-caption font-bold text-fg-muted">Spacing (4px base)</div>
              <div className="mt-2 flex items-end gap-1.5">
                {[1, 2, 3, 4, 6, 8, 12].map((s) => (
                  <div key={s} className="flex flex-col items-center gap-1">
                    <div className="w-4 rounded-xs bg-blue-500" style={{ height: s * 4 }} />
                    <span className="text-[10px] tabular text-fg-subtle">{s * 4}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card padding="sm">
              <div className="text-caption font-bold text-fg-muted">Radius</div>
              <div className="mt-2 flex items-end gap-2">
                {[
                  ["xs", "rounded-xs"],
                  ["sm", "rounded-sm"],
                  ["md", "rounded-md"],
                  ["lg", "rounded-lg"],
                  ["xl", "rounded-xl"],
                ].map(([n, c]) => (
                  <div key={n} className="flex flex-col items-center gap-1">
                    <div className={`size-10 border border-blue-400 bg-blue-500/20 ${c}`} />
                    <span className="text-[10px] text-fg-subtle">{n}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card padding="sm">
              <div className="text-caption font-bold text-fg-muted">Shadows & glows</div>
              <div className="mt-2 flex gap-3">
                {["shadow-md", "shadow-glow-sm", "shadow-glow-md", "shadow-glow-volt"].map((s) => (
                  <div key={s} className={`size-10 rounded-md bg-surface-2 ${s}`} title={s} />
                ))}
              </div>
            </Card>
          </div>
        </Section>

        <Section id="buttons" title="Buttons" description="Primary is the electric gradient with glow. Volt is reserved for the single most important action on a screen (pay, go live). Sizes: sm 36, md 44, lg 48, xl 56.">
          <Card className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="volt">Volt</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="link">Link</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" leftIcon={<Plus />}>
                Small
              </Button>
              <Button size="md" leftIcon={<CalendarPlus />}>
                Medium
              </Button>
              <Button size="lg" leftIcon={<Swords />}>
                Large
              </Button>
              <Button size="xl">Extra large</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button loading>Loading</Button>
              <Button disabled>Disabled</Button>
              <Button variant="secondary" disabled>
                Disabled
              </Button>
              <IconButton label="Notifications">
                <Bell />
              </IconButton>
              <IconButton label="Delete" variant="danger">
                <Trash2 />
              </IconButton>
              <IconButton label="Search" variant="ghost">
                <Search />
              </IconButton>
              <Dropdown trigger={<Button variant="secondary">Dropdown</Button>} label="Actions" items={[{ label: "Edit" }, { label: "Duplicate" }, { label: "Archive", tone: "danger" }]} />
            </div>
            <p className="text-caption text-fg-subtle">Focus: 2px blue-400 ring with canvas offset. Hover: brighter glow. Active: scale 0.98. Disabled: 45% opacity.</p>
          </Card>
        </Section>

        <Section id="forms" title="Forms" description="All controls share one surface (surface-2), 1px line border, blue focus glow and a red invalid state.">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="space-y-4">
              <Field label="Email" hint="We'll never share it." required>
                {(id, d) => <Input id={id} type="email" placeholder="you@example.com" leading={<Mail />} aria-describedby={d} />}
              </Field>
              <Field label="With error" error="This field is required.">
                {(id, d) => <Input id={id} invalid placeholder="Invalid" aria-describedby={d} />}
              </Field>
              <Field label="Select">{(id) => <Select id={id} placeholder="Choose a club" options={[{ value: "a", label: "HITTERS New Cairo" }, { value: "b", label: "HITTERS Maadi" }]} />}</Field>
              <Field label="Textarea">{(id) => <Textarea id={id} placeholder="Tell players about your session…" />}</Field>
              <Input disabled placeholder="Disabled input" />
            </Card>
            <Card className="space-y-5">
              <Switch label="Push notifications" description="Bookings and approvals" checked={sw} onChange={setSw} />
              <Checkbox label="Keep me signed in" defaultChecked />
              <div>
                <div className="mb-2 text-body-sm font-semibold text-fg-muted">Chips</div>
                <div className="flex flex-wrap gap-2">
                  {LEVELS.map((l) => (
                    <Chip key={l} selected={chip === l} onClick={() => setChip(l)}>
                      Level {l}
                    </Chip>
                  ))}
                  <Chip disabled>Disabled</Chip>
                </div>
              </div>
              <div>
                <div className="mb-2 text-body-sm font-semibold text-fg-muted">Segmented</div>
                <Tabs variant="pill" fullWidth value={pill} onChange={setPill} items={[{ value: "Solo", label: "Solo" }, { value: "Pair", label: "Pair" }, { value: "3+1", label: "3 + 1" }]} />
              </div>
              <div>
                <div className="mb-2 text-body-sm font-semibold text-fg-muted">Tabs</div>
                <Tabs value={tab} onChange={setTab} items={[{ value: "one", label: "Open", count: 4 }, { value: "two", label: "Players" }, { value: "three", label: "Requests", count: 0 }]} />
              </div>
              <Divider label="or" />
              <DateStrip value={strip} onChange={setStrip} days={8} className="mx-0 px-0" />
            </Card>
          </div>
        </Section>

        <Section id="cards" title="Cards, avatars & badges">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader title="Default card" description="surface-1, 1px line" />
              <p className="text-body-sm text-fg-muted">Content sits on the first surface level.</p>
            </Card>
            <Card variant="interactive" href="#cards">
              <CardHeader title="Interactive" description="Hover: blue border + glow" />
              <p className="text-body-sm text-fg-muted">Used for anything that navigates.</p>
            </Card>
            <Card variant="brand">
              <CardHeader title="Brand" description="Electric gradient hero" />
              <p className="text-body-sm text-white/85">One per screen, for the primary focus.</p>
            </Card>
          </div>
          <Card className="mt-4 space-y-5">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name="Amr Hefny" size="xs" />
              <Avatar name="Omar Farouk" size="sm" online />
              <Avatar name="Laila Mansour" size="md" ring />
              <Avatar name="Salma Youssef" size="lg" />
              <Avatar name="Karim Adel" size="xl" online />
              <AvatarGroup names={["Amr Hefny", "Omar Farouk", "Laila Mansour", "Salma Youssef", "Karim Adel", "Hana Sherif"]} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Neutral</Badge>
              <Badge tone="brand">Brand</Badge>
              <Badge tone="info">Info</Badge>
              <Badge tone="success" dot>
                Success
              </Badge>
              <Badge tone="warning" dot>
                Warning
              </Badge>
              <Badge tone="danger" dot>
                Danger
              </Badge>
              <Badge tone="volt" dot pulse>
                Live
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {["confirmed", "pending", "cancelled", "completed", "live", "open", "full", "maintenance", "active", "expired"].map((s) => (
                <StatusBadge key={s} status={s} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {LEVELS.map((l) => (
                <LevelBadge key={l} level={l} withLabel />
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile label="Matches" value={48} delta={{ value: "+6 this month" }} />
              <StatTile label="Win rate" value="60%" delta={{ value: "-2 pts", positive: false }} />
              <StatTile label="Rating" value="4.8" tone="brand" />
            </div>
            <ProgressBar value={5} max={8} label="Enrollment" />
          </Card>
        </Section>

        <Section id="feedback" title="Alerts, toasts & modals">
          <div className="grid gap-3 md:grid-cols-2">
            <Alert tone="info" title="Heads up">
              Peak pricing applies between 18:00 and 21:00.
            </Alert>
            <Alert tone="success" title="Booking confirmed">
              Court 2 · Today 19:00.
            </Alert>
            <Alert tone="warning" title="1 spot left" action={<Button size="sm" variant="secondary">Enroll now</Button>}>
              Enrollment closes when the group is full.
            </Alert>
            <Alert tone="danger" title="Payment failed">
              Your card was declined. Try another method.
            </Alert>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => toast({ title: "Info toast", description: "Something you should know." })}>
              Info toast
            </Button>
            <Button variant="secondary" onClick={() => toast({ tone: "success", title: "Join request sent" })}>
              Success toast
            </Button>
            <Button variant="secondary" onClick={() => toast({ tone: "danger", title: "Nothing was saved", description: "Check your connection." })}>
              Danger toast
            </Button>
            <Button onClick={() => setModal(true)}>Open modal</Button>
            <Button variant="danger" onClick={() => setConfirm(true)}>
              Confirm dialog
            </Button>
          </div>
          <Modal
            open={modal}
            onClose={() => setModal(false)}
            title="Create a session"
            description="Bottom sheet on mobile, centered on desktop."
            footer={
              <>
                <Button variant="ghost" onClick={() => setModal(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setModal(false)}>Publish</Button>
              </>
            }
          >
            <Field label="Title">{(id) => <Input id={id} placeholder="Evening doubles" />}</Field>
          </Modal>
          <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => setConfirm(false)} tone="danger" title="Cancel this booking?" description="You will be refunded according to the cancellation policy." confirmLabel="Cancel booking" />
        </Section>

        <Section id="data" title="Tables & calendar">
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Player</TH>
                    <TH>Level</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Amount</TH>
                  </TR>
                </THead>
                <TBody>
                  {[
                    ["Amr Hefny", "B", "confirmed", "675"],
                    ["Laila Mansour", "B", "pending", "500"],
                    ["Salma Youssef", "A", "completed", "900"],
                  ].map(([n, l, s, a]) => (
                    <TR key={n} interactive>
                      <TD>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={n} size="xs" /> <span className="font-semibold">{n}</span>
                        </div>
                      </TD>
                      <TD>
                        <LevelBadge level={l as "A"} size="sm" />
                      </TD>
                      <TD>
                        <StatusBadge status={s} />
                      </TD>
                      <TD numeric>EGP {a}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
            <Calendar value={date} onChange={setDate} min={new Date()} marked={[new Date(Date.now() + 3 * 86_400_000)]} />
          </div>
        </Section>

        <Section id="states" title="Empty, loading, error & confirmation states">
          <div className="grid gap-4 md:grid-cols-2">
            <EmptyState icon={<Swords />} title="No sessions yet" description="Open a session and let players come to you." action={<Button leftIcon={<Plus />}>Create a session</Button>} />
            <ErrorState description="We couldn't load your bookings." onRetry={() => toast({ title: "Retrying…" })} />
            <Card padding="sm" className="space-y-3">
              <LoadingState label="Loading bookings" />
              <SkeletonCard />
            </Card>
            <Card padding="sm">
              <ConfirmationState title="Court booked" description="Court 2 · Today 19:00 · 90 minutes." action={<Button>Find players</Button>} secondaryAction={<Button variant="ghost">Back to home</Button>} />
            </Card>
          </div>
        </Section>
      </main>
    </div>
  );
}
