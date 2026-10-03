"use client";

import { useState } from "react";
import { CalendarCheck, History, LogOut, Settings, Share2, Trophy } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { StatTile, Switch } from "@/components/ui/misc";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/states";
import { BookingCard } from "@/components/patterns/cards";
import { bookings, currentUser, locationBySlug } from "@/data/mock";

type Tab = "bookings" | "history" | "settings";

const history = [
  { id: "h1", date: "28 Sep", vs: "Omar F. & Laila M.", with: "Nour E.", score: "6-4 · 3-6 · 7-5", win: true, loc: "new-cairo" },
  { id: "h2", date: "24 Sep", vs: "Salma Y. & Karim A.", with: "Hana S.", score: "2-6 · 4-6", win: false, loc: "new-cairo" },
  { id: "h3", date: "19 Sep", vs: "Youssef T. & Nour E.", with: "Laila M.", score: "6-2 · 6-3", win: true, loc: "maadi" },
];

export default function ProfilePage() {
  const [tab, setTab] = useState<Tab>("bookings");
  const [push, setPush] = useState(true);
  const [matchAlerts, setMatchAlerts] = useState(true);
  const [visible, setVisible] = useState(true);
  const winRate = Math.round((currentUser.wins / currentUser.matches) * 100);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={currentUser.name} size="xl" ring />
          <div>
            <h1 className="text-h2">{currentUser.name}</h1>
            <div className="mt-1 flex items-center gap-2">
              <LevelBadge level={currentUser.level} size="sm" withLabel />
            </div>
            <div className="mt-1 text-caption text-fg-muted">
              {currentUser.side} side · Member since {currentUser.memberSince}
            </div>
          </div>
        </div>
        <IconButton label="Share profile" variant="ghost" size="sm">
          <Share2 />
        </IconButton>
      </div>

      <Card variant="brand" padding="md">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-overline uppercase text-white/80">Membership</div>
            <div className="text-h3">HITTER Pro</div>
            <div className="text-caption text-white/75">Renews 1 Nov · {locationBySlug(currentUser.homeClub)?.name}</div>
          </div>
          <Badge className="bg-white/15 text-white" dot tone="success">
            Active
          </Badge>
        </div>
      </Card>

      <div className="grid grid-cols-4 gap-2">
        <StatTile label="Matches" value={currentUser.matches} className="p-3" />
        <StatTile label="Wins" value={currentUser.wins} className="p-3" />
        <StatTile label="Win %" value={winRate} className="p-3" />
        <StatTile label="Rating" value={currentUser.rating.toFixed(1)} className="p-3" />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        fullWidth
        items={[
          { value: "bookings", label: "Bookings", icon: <CalendarCheck /> },
          { value: "history", label: "History", icon: <History /> },
          { value: "settings", label: "Settings", icon: <Settings /> },
        ]}
      />

      {tab === "bookings" && (
        <div className="space-y-5">
          <section>
            <SectionHeader title="Upcoming" />
            <div className="space-y-2.5">
              {bookings
                .filter((b) => b.status === "confirmed" || b.status === "pending")
                .map((b) => (
                  <BookingCard key={b.id} booking={b} />
                ))}
            </div>
          </section>
          <section>
            <SectionHeader title="Past" />
            <div className="space-y-2.5">
              {bookings
                .filter((b) => b.status === "completed" || b.status === "cancelled")
                .map((b) => (
                  <BookingCard key={b.id} booking={b} />
                ))}
            </div>
          </section>
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-2.5">
          {history.map((h) => (
            <Card key={h.id} padding="sm">
              <div className="flex items-center gap-3">
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-md text-body font-extrabold ${h.win ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
                  {h.win ? "W" : "L"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body-sm font-bold">
                    with {h.with} <span className="font-normal text-fg-muted">vs</span> {h.vs}
                  </div>
                  <div className="text-caption text-fg-muted">
                    {h.date} · {locationBySlug(h.loc)?.name.replace("HITTERS ", "")}
                  </div>
                </div>
                <span className="text-caption font-semibold tabular text-fg-muted">{h.score}</span>
              </div>
            </Card>
          ))}
          <EmptyState compact icon={<Trophy />} title="No tournaments yet" description="Tournament and league results will show here once you enter one." />
        </div>
      )}

      {tab === "settings" && (
        <div className="space-y-5">
          <Card padding="md" className="space-y-5">
            <Switch label="Push notifications" description="Bookings, approvals and reminders" checked={push} onChange={setPush} />
            <Switch label="Match alerts" description="When a session near you needs a player at your level" checked={matchAlerts} onChange={setMatchAlerts} />
            <Switch label="Visible to other players" description="Let organisers find and invite you" checked={visible} onChange={setVisible} />
          </Card>
          <Card padding="md" className="space-y-4">
            <Field label="Preferred side">
              {(id) => (
                <Select
                  id={id}
                  defaultValue="Right"
                  options={[
                    { value: "Left", label: "Left" },
                    { value: "Right", label: "Right" },
                    { value: "Both", label: "Both" },
                  ]}
                />
              )}
            </Field>
            <Field label="Home club">
              {(id) => (
                <Select
                  id={id}
                  defaultValue="new-cairo"
                  options={[
                    { value: "new-cairo", label: "HITTERS New Cairo" },
                    { value: "sheikh-zayed", label: "HITTERS Sheikh Zayed" },
                    { value: "maadi", label: "HITTERS Maadi" },
                  ]}
                />
              )}
            </Field>
          </Card>
          <Button variant="ghost" fullWidth leftIcon={<LogOut />} href="/login" className="text-danger hover:bg-danger/10 hover:text-danger">
            Sign out
          </Button>
        </div>
      )}
    </div>
  );
}
