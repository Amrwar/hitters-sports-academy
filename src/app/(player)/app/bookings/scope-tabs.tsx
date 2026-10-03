"use client";

import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";

export function ScopeTabs({ current }: { current: "upcoming" | "past" }) {
  const router = useRouter();
  return (
    <Tabs
      variant="pill"
      fullWidth
      value={current}
      onChange={(v) => router.push(v === "past" ? "/app/bookings?scope=past" : "/app/bookings")}
      items={[
        { value: "upcoming", label: "Upcoming" },
        { value: "past", label: "History" },
      ]}
    />
  );
}
