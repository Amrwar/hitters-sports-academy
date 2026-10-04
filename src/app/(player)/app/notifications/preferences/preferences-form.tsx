"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import type { NotificationCategory } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { CHANNELS, NOTIFICATION_CATEGORIES } from "@/lib/notifications";
import { updatePreferencesAction } from "@/server/actions/notifications";

export type PrefRow = { category: NotificationCategory; inApp: boolean; email: boolean; push: boolean; sms: boolean };

const KEY: Record<string, keyof Omit<PrefRow, "category">> = { IN_APP: "inApp", EMAIL: "email", PUSH: "push", SMS: "sms" };

export function PreferencesForm({ initial }: { initial: PrefRow[] }) {
  const [rows, setRows] = useState(initial);
  const [pending, start] = useTransition();
  const { toast } = useToast();

  const set = (category: NotificationCategory, field: keyof Omit<PrefRow, "category">, value: boolean) =>
    setRows((prev) => prev.map((r) => (r.category === category ? { ...r, [field]: value } : r)));

  return (
    <div className="space-y-4">
      {NOTIFICATION_CATEGORIES.map((cat) => {
        const row = rows.find((r) => r.category === cat.value);
        if (!row) return null;
        return (
          <Card key={cat.value}>
            <h3 className="text-h4">{cat.label}</h3>
            <p className="mt-0.5 text-body-sm text-fg-muted">{cat.description}</p>
            <div className="mt-4 space-y-3 border-t border-line/10 pt-4">
              {CHANNELS.map((ch) => {
                const field = KEY[ch.value];
                return (
                  <div key={ch.value} className="flex items-center justify-between gap-4">
                    <Switch
                      checked={row[field]}
                      onChange={(v) => set(cat.value, field, v)}
                      label={ch.label}
                      description={ch.live ? undefined : "Saved now, delivered once this channel is connected"}
                      className="flex-1"
                    />
                    {!ch.live && (
                      <Badge tone="neutral" size="md">
                        Soon
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      <Button
        fullWidth
        leftIcon={<Save />}
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await updatePreferencesAction(rows);
            toast(res.ok ? { tone: "success", title: "Preferences saved" } : { tone: "danger", title: res.message });
          })
        }
      >
        Save preferences
      </Button>
    </div>
  );
}
