"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GameStatus } from "@prisma/client";
import { Swords } from "lucide-react";
import { AdminShell } from "@/components/nav/admin-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { Badge, LevelBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/states";
import { Modal } from "@/components/ui/modal";
import { Field, Textarea } from "@/components/ui/input";
import { StatTile } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table, TableWrap } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { GameStatusBadge, costLabel } from "@/components/patterns/game-card";
import { GAME_STATUSES, gameFormatLabel } from "@/lib/catalog";
import { formatInZone } from "@/lib/time";
import type { GameView } from "@/server/services/game-sessions";
import { cancelGameAction } from "@/server/actions/game-sessions";

type Props = {
  locations: { id: string; name: string; timezone: string }[];
  selectedId: string | null;
  status: GameStatus | null;
  scope: "upcoming" | "all";
  items: GameView[];
  total: number;
  canManage: Record<string, boolean>;
};

export function GamesAdmin({ locations, selectedId, status, scope, items, total, canManage }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [cancel, setCancel] = useState<GameView | null>(null);
  const [busy, setBusy] = useState(false);

  const go = (patch: Record<string, string | null>) => {
    const merged: Record<string, string | null> = { location: selectedId, status, scope: scope === "all" ? "all" : null, ...patch };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    router.push(`/admin/games?${params.toString()}`);
  };

  const live = items.filter((g) => ["OPEN", "FULL", "CONFIRMED"].includes(g.status));
  const openSpots = live.reduce((n, g) => n + g.spotsLeft, 0);

  async function submitCancel(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!cancel) return;
    const reason = String(new FormData(e.currentTarget).get("reason") ?? "");
    setBusy(true);
    const res = await cancelGameAction(cancel.id, reason || undefined);
    setBusy(false);
    if (res.ok) {
      toast({ tone: "success", title: `Game ${cancel.code} cancelled` });
      setCancel(null);
      router.refresh();
    } else toast({ tone: "danger", title: "Could not cancel", description: res.message });
  }

  return (
    <AdminShell title="Games" breadcrumb={["Operations", "Games"]}>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label={scope === "all" ? "Games" : "Upcoming games"} value={total} />
        <StatTile label="Live lineups" value={live.length} />
        <StatTile label="Open spots" value={openSpots} tone="brand" icon={<Swords />} />
      </div>

      <Card padding="md" className="mt-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Location" className="min-w-52">{(id) => <Select id={id} value={selectedId ?? ""} onChange={(e) => go({ location: e.target.value || null })} options={[{ value: "", label: "All my locations" }, ...locations.map((l) => ({ value: l.id, label: l.name }))]} />}</Field>
          <Field label="Status" className="min-w-44">{(id) => <Select id={id} value={status ?? ""} onChange={(e) => go({ status: e.target.value || null })} options={[{ value: "", label: "Any status" }, ...GAME_STATUSES.map((s) => ({ value: s.value, label: s.label }))]} />}</Field>
          <Tabs
            variant="pill"
            value={scope}
            onChange={(v) => go({ scope: v === "all" ? "all" : null })}
            items={[
              { value: "upcoming", label: "Upcoming" },
              { value: "all", label: "All time" },
            ]}
          />
        </div>
      </Card>

      {items.length === 0 ? (
        <EmptyState className="mt-5" icon={<Swords />} title="No games" description="Games players organize on their bookings appear here with their lineups." />
      ) : (
        <TableWrap className="mt-5">
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Game</TH>
                <TH>Organizer</TH>
                <TH>Lineup</TH>
                <TH>Levels</TH>
                <TH>Cost</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((g) => {
                const accepted = g.participants.filter((p) => p.status === "ACCEPTED");
                return (
                  <TR key={g.id}>
                    <TD>
                      <div className="font-semibold">{formatInZone(new Date(g.startsAt), g.location.timezone, { weekday: "short", day: "numeric", month: "short" })}</div>
                      <div className="text-caption text-fg-muted tabular">
                        {formatInZone(new Date(g.startsAt), g.location.timezone, { hour: "2-digit", minute: "2-digit" })} · {g.location.name.replace("HITTERS ", "")} · {g.court.name}
                      </div>
                    </TD>
                    <TD>
                      <div className="font-semibold">{g.description?.trim() || gameFormatLabel(g.format)}</div>
                      <div className="text-caption text-fg-muted tabular">
                        {g.code} · {gameFormatLabel(g.format)} · {g.visibility === "PUBLIC" ? "discoverable" : "private"}
                        {g.openToRequests ? " · requests open" : ""}
                      </div>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Avatar name={g.organizer.name} size="xs" /> <span className="font-semibold">{g.organizer.name}</span>
                      </div>
                    </TD>
                    <TD>
                      <div className="font-semibold tabular">
                        {g.acceptedCount}/{g.maxPlayers}
                      </div>
                      <div className="truncate text-caption text-fg-muted" title={accepted.map((p) => p.user.name).join(", ")}>
                        {accepted.map((p) => p.user.name.split(" ")[0]).join(", ")}
                        {g.invitedCount ? ` · ${g.invitedCount} invited` : ""}
                      </div>
                    </TD>
                    <TD>
                      <div className="flex gap-1">{g.levels.length ? g.levels.map((l) => <LevelBadge key={l} level={l} size="sm" />) : <Badge size="sm">Any</Badge>}</div>
                    </TD>
                    <TD className="tabular">{costLabel(g)}</TD>
                    <TD>
                      <GameStatusBadge status={g.status} size="sm" />
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" href={`/app/play/${g.code}`}>
                          Open
                        </Button>
                        {canManage[g.locationId] && ["DRAFT", "OPEN", "FULL", "CONFIRMED", "IN_PROGRESS"].includes(g.status) && (
                          <Button size="sm" variant="ghost" className="text-danger hover:bg-danger/10 hover:text-danger" onClick={() => setCancel(g)}>
                            Cancel
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>
      )}

      <Modal open={!!cancel} onClose={() => setCancel(null)} title={cancel ? `Cancel game ${cancel.code}?` : ""} description="The organizer and every player are notified. The court booking is not affected." size="sm">
        <form onSubmit={submitCancel} className="space-y-4 pb-2">
          <Field label="Reason">{(id) => <Textarea id={id} name="reason" maxLength={500} placeholder="Court maintenance, weather, event…" />}</Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCancel(null)}>
              Keep
            </Button>
            <Button type="submit" variant="danger" loading={busy}>
              Cancel game
            </Button>
          </div>
        </form>
      </Modal>
    </AdminShell>
  );
}
