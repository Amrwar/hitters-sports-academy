"use client";

import { useRouter } from "next/navigation";
import type { PlayerLevel } from "@prisma/client";
import { Chip, ChipRow } from "@/components/ui/misc";
import { LEVELS } from "@/lib/tokens";

export function FilterChips({ locations, selectedLocation, selectedLevel, myLevel }: { locations: { id: string; name: string }[]; selectedLocation: string | null; selectedLevel: PlayerLevel | null; myLevel: PlayerLevel | null }) {
  const router = useRouter();
  const go = (location: string | null, level: string | null) => {
    const q = new URLSearchParams();
    if (location) q.set("location", location);
    if (level) q.set("level", level);
    router.push(`/app/trainers${q.size ? `?${q}` : ""}`);
  };
  return (
    <div className="space-y-2">
      <ChipRow>
        <Chip selected={!selectedLocation} onClick={() => go(null, selectedLevel)}>
          All clubs
        </Chip>
        {locations.map((l) => (
          <Chip key={l.id} selected={selectedLocation === l.id} onClick={() => go(selectedLocation === l.id ? null : l.id, selectedLevel)}>
            {l.name}
          </Chip>
        ))}
      </ChipRow>
      <ChipRow>
        {myLevel && (
          <Chip selected={selectedLevel === myLevel} onClick={() => go(selectedLocation, selectedLevel === myLevel ? null : myLevel)}>
            Coaches my level
          </Chip>
        )}
        {LEVELS.map((l) => (
          <Chip key={l} selected={selectedLevel === l} onClick={() => go(selectedLocation, selectedLevel === l ? null : l)}>
            Level {l}
          </Chip>
        ))}
      </ChipRow>
    </div>
  );
}
