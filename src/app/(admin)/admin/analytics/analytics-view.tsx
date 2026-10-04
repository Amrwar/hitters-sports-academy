"use client";

import Link from "next/link";
import { CalendarDays, GraduationCap, Percent, Swords, UserPlus, Wallet } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { TBody, TD, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { money } from "@/components/patterns/booking-status";
import { count } from "@/lib/text";
import { cn } from "@/lib/cn";
import type { AnalyticsReport } from "@/server/services/analytics";

const RANGES = [4, 8, 12, 26];

/** Percentage change, or null when there is nothing to compare against. */
function delta(now: number, before: number): { value: string; positive: boolean } | undefined {
  if (!before) return undefined;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return { value: "no change", positive: true };
  return { value: `${pct > 0 ? "+" : ""}${pct}% vs previous`, positive: pct > 0 };
}

function Bars({ points, format, highlightLast }: { points: { label: string; value: number }[]; format: (v: number) => string; highlightLast?: boolean }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const empty = points.every((p) => p.value === 0);
  if (empty) return <p className="flex h-48 items-center justify-center text-body-sm text-fg-muted">Nothing recorded in this period yet.</p>;
  return (
    <div className="flex h-48 items-end gap-2">
      {points.map((p, i) => (
        <div key={p.label} className="flex h-full flex-1 flex-col items-center gap-2" title={`${p.label}: ${format(p.value)}`}>
          <span className="text-caption font-semibold tabular text-fg-muted">{p.value ? format(p.value) : ""}</span>
          <div className="flex w-full flex-1 items-end overflow-hidden rounded-t-xs bg-brand/10">
            <div
              className={cn("w-full rounded-t-xs transition-all", highlightLast && i === points.length - 1 ? "bg-brand-gradient shadow-glow-sm" : "bg-brand/60")}
              style={{ height: `${Math.max(2, (p.value / max) * 100)}%` }}
            />
          </div>
          <span className="text-caption font-semibold text-fg-subtle">{p.label}</span>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsView({ report, weeks }: { report: AnalyticsReport; weeks: number }) {
  const { totals, previous, matchmaking, academy } = report;
  const thousands = (cents: number) => `${Math.round(cents / 100_000)}k`;

  return (
    <AdminShell
      title="Analytics"
      breadcrumb={["Overview", "Analytics"]}
      actions={
        <div className="flex items-center gap-1 rounded-full border border-line/10 bg-surface-2 p-1">
          {RANGES.map((w) => (
            <Link
              key={w}
              href={`/admin/analytics?weeks=${w}`}
              className={cn(
                "rounded-full px-3 py-1.5 text-body-sm font-semibold transition-colors",
                w === weeks ? "bg-brand-gradient text-white shadow-glow-sm" : "text-fg-muted hover:text-fg",
              )}
            >
              {w}w
            </Link>
          ))}
        </div>
      }
    >
      <p className="mb-5 text-body-sm text-fg-muted">
        The last {weeks} weeks across {report.scope.locations === 1 ? report.scope.names[0] : count(report.scope.locations, "club")}. Figures come straight from confirmed and completed bookings; nothing is
        estimated.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile size="lg" label="Court revenue" value={money(totals.revenueCents)} icon={<Wallet />} tone="brand" delta={delta(totals.revenueCents, previous.revenueCents)} />
        <StatTile size="lg" label="Bookings" value={totals.bookings.toLocaleString("en")} icon={<CalendarDays />} delta={delta(totals.bookings, previous.bookings)} />
        <StatTile size="lg" label="Court occupancy" value={`${totals.occupancy}%`} icon={<Percent />} delta={delta(totals.occupancy, previous.occupancy)} />
        <StatTile size="lg" label="New members" value={totals.newMembers.toLocaleString("en")} icon={<UserPlus />} delta={delta(totals.newMembers, previous.newMembers)} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Revenue by week" description="Thousands EGP, confirmed and completed bookings" />
          <Bars points={report.revenueByWeek} format={thousands} highlightLast />
        </Card>
        <Card>
          <CardHeader title="Bookings by week" description="Court reservations across your clubs" />
          <Bars points={report.bookingsByWeek} format={(v) => String(v)} highlightLast />
        </Card>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Busiest hours" description="When courts actually get booked" />
          <Bars points={report.byHour} format={(v) => String(v)} />
        </Card>
        <Card>
          <CardHeader title="Player levels" description="Every active profile by official level" />
          <ul className="space-y-4">
            {report.levels.map((l) => {
              const total = Math.max(1, report.levels.reduce((n, x) => n + x.value, 0));
              return (
                <li key={l.label}>
                  <div className="mb-1.5 flex items-center justify-between text-body-sm">
                    <span className="font-semibold">{l.label}</span>
                    <span className="tabular text-fg-muted">
                      {l.value} · {Math.round((l.value / total) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-line/10">
                    <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${(l.value / total) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Matchmaking" description="How often an open session actually filled" action={<Badge tone={matchmaking.fillRate >= 70 ? "success" : "neutral"}>{matchmaking.fillRate}% filled</Badge>} />
          <dl className="grid grid-cols-2 gap-4">
            {[
              { k: "Sessions published", v: matchmaking.games.toLocaleString("en") },
              { k: "Reached a full lineup", v: matchmaking.filled.toLocaleString("en") },
              { k: "Join requests", v: matchmaking.requests.toLocaleString("en") },
              { k: "Accepted by organisers", v: `${matchmaking.accepted.toLocaleString("en")} · ${matchmaking.acceptRate}%` },
            ].map((row) => (
              <div key={row.k} className="rounded-lg border border-line/10 bg-surface-2 p-3.5">
                <dt className="text-caption text-fg-muted">{row.k}</dt>
                <dd className="mt-1 text-h4 tabular">{row.v}</dd>
              </div>
            ))}
          </dl>
          {matchmaking.games === 0 && <p className="mt-4 text-body-sm text-fg-muted">No sessions were published in this period, so there is nothing to measure yet.</p>}
        </Card>

        <Card>
          <CardHeader title="Academy" description="Coaching and programs" action={<Badge tone={academy.fillRate >= 70 ? "success" : "neutral"}>{academy.fillRate}% of places taken</Badge>} />
          <dl className="grid grid-cols-2 gap-4">
            {[
              { k: "Live programs", v: academy.programs.toLocaleString("en") },
              { k: "Places taken", v: `${academy.enrolled} of ${academy.capacity}` },
              { k: "Private lessons", v: academy.lessons.toLocaleString("en") },
              { k: "Lesson revenue", v: money(academy.lessonRevenueCents) },
            ].map((row) => (
              <div key={row.k} className="rounded-lg border border-line/10 bg-surface-2 p-3.5">
                <dt className="text-caption text-fg-muted">{row.k}</dt>
                <dd className="mt-1 text-h4 tabular">{row.v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-body-sm text-fg-muted">{count(academy.packagesSold, "training package")} sold in this period.</p>
        </Card>
      </div>

      <Card padding="none" className="mt-5">
        <CardHeader title="By club" description="Revenue, volume and how full the courts were" className="px-5 pt-5" />
        {report.byLocation.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState compact icon={<Swords />} title="No clubs in your scope" description="Ask an academy owner to give you access to a location." />
          </div>
        ) : (
          <TableWrap className="rounded-none border-0 border-t">
            <Table>
              <THead>
                <TR>
                  <TH>Club</TH>
                  <TH className="text-right">Bookings</TH>
                  <TH className="text-right">Revenue</TH>
                  <TH className="text-right">Occupancy</TH>
                </TR>
              </THead>
              <TBody>
                {report.byLocation.map((l) => (
                  <TR key={l.id}>
                    <TD className="font-semibold">{l.name}</TD>
                    <TD className="text-right tabular">{l.bookings.toLocaleString("en")}</TD>
                    <TD className="text-right tabular">{money(l.revenueCents)}</TD>
                    <TD className="text-right tabular">{l.occupancy}%</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-md bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-400/20 [&_svg]:size-5">
              <CalendarDays />
            </span>
            <div>
              <div className="text-caption text-fg-muted">Cancellations</div>
              <div className="text-h4 tabular">
                {totals.cancelled} · {totals.cancellationRate}%
              </div>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-md bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-400/20 [&_svg]:size-5">
              <UserPlus />
            </span>
            <div>
              <div className="text-caption text-fg-muted">Active members</div>
              <div className="text-h4 tabular">{totals.activeMembers.toLocaleString("en")}</div>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-md bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-400/20 [&_svg]:size-5">
              <GraduationCap />
            </span>
            <div>
              <div className="text-caption text-fg-muted">Average booking value</div>
              <div className="text-h4 tabular">{money(totals.bookings ? Math.round(totals.revenueCents / totals.bookings) : 0)}</div>
            </div>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
