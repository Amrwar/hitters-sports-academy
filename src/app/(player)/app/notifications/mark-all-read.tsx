"use client";

import { useState } from "react";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markAllNotificationsReadAction } from "@/server/actions/profile";

export function MarkAllReadButton() {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      leftIcon={<CheckCheck />}
      loading={loading}
      onClick={async () => {
        setLoading(true);
        await markAllNotificationsReadAction();
        setLoading(false);
      }}
    >
      Mark all read
    </Button>
  );
}
