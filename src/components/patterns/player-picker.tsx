"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayerLevel } from "@prisma/client";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { LevelBadge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/states";
import { searchPlayersAction } from "@/server/actions/game-sessions";

export type PickedPlayer = { id: string; name: string; level: PlayerLevel | null };

/** Search-and-select of members to invite. Excludes already-picked ids and respects the remaining spots. */
export function PlayerPicker({ value, onChange, max, exclude = [] }: { value: PickedPlayer[]; onChange: (v: PickedPlayer[]) => void; max: number; exclude?: string[] }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<(PickedPlayer & { homeLocation: string | null })[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const full = value.length >= max;

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      const res = await searchPlayersAction(q.trim());
      setLoading(false);
      setHits(res.ok ? res.data.map((h) => ({ id: h.id, name: h.name, level: h.level, homeLocation: h.homeLocation })) : []);
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  const taken = new Set([...value.map((v) => v.id), ...exclude]);
  const visible = hits.filter((h) => !taken.has(h.id));

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/30 bg-blue-500/10 py-1 pl-1 pr-2 text-body-sm font-semibold">
              <Avatar name={p.name} size="xs" /> {p.name.split(" ")[0]}
              {p.level && <LevelBadge level={p.level} size="sm" />}
              <button type="button" aria-label={`Remove ${p.name}`} onClick={() => onChange(value.filter((v) => v.id !== p.id))} className="rounded-full p-0.5 text-fg-muted hover:text-fg">
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={full ? `All ${max} spots have invitations` : "Search members by name or email"} leading={<Search />} disabled={full} aria-label="Search players" />
      {q.trim().length >= 2 && !full && (
        <div className="overflow-hidden rounded-lg border border-line/10 bg-surface-1">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2.5 text-body-sm text-fg-muted">
              <Spinner size={16} /> Searching…
            </div>
          )}
          {!loading && visible.length === 0 && <div className="px-3 py-2.5 text-body-sm text-fg-muted">No members match. They may need to create an account first.</div>}
          {!loading &&
            visible.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  onChange([...value, { id: h.id, name: h.name, level: h.level }]);
                  setQ("");
                }}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
              >
                <Avatar name={h.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-bold">{h.name}</span>
                  {h.homeLocation && <span className="block text-caption text-fg-muted">{h.homeLocation}</span>}
                </span>
                {h.level && <LevelBadge level={h.level} size="sm" />}
              </button>
            ))}
        </div>
      )}
      <div className="text-caption text-fg-subtle">
        {value.length}/{max} invitations
      </div>
    </div>
  );
}
