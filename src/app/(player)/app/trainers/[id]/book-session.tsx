"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/card";
import { DateStrip } from "@/components/ui/calendar";
import { Chip } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { money } from "@/data/mock";

const times = ["08:00", "09:00", "10:00", "17:00", "18:00", "19:00", "20:00"];

/** Availability picker for a private session. Data is static until scheduling is implemented. */
export function BookSessionPanel({ trainerName, rate }: { trainerName: string; rate: number }) {
  const { toast } = useToast();
  const [date, setDate] = useState(() => new Date());
  const [time, setTime] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  return (
    <section>
      <SectionHeader eyebrow="Availability" title="Book a private session" />
      <DateStrip value={date} onChange={setDate} days={10} />
      <div className="mt-3 flex flex-wrap gap-2">
        {times.map((t, i) => (
          <Chip key={t} selected={time === t} disabled={i % 4 === 2} onClick={() => setTime(t)}>
            {t}
          </Chip>
        ))}
      </div>
      <Button size="lg" fullWidth className="mt-4" disabled={!time} onClick={() => setConfirm(true)}>
        {time ? `Book ${time} · ${money(rate)}` : "Select a time"}
      </Button>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          toast({ tone: "success", title: "Session requested", description: `${trainerName} will confirm within 24h.` });
        }}
        title="Request private session"
        description={`${trainerName} · ${date.toLocaleDateString("en", { weekday: "long", day: "numeric", month: "short" })} at ${time}. ${money(rate)} per hour, charged on confirmation.`}
        confirmLabel="Send request"
      />
    </section>
  );
}
