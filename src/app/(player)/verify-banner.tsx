"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { resendVerificationAction } from "@/server/actions/auth";

export function VerifyBanner({ email }: { email: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  return (
    <Alert
      tone="warning"
      title="Verify your email"
      className="mb-5"
      action={
        <Button
          size="sm"
          variant="secondary"
          loading={loading}
          onClick={async () => {
            setLoading(true);
            const res = await resendVerificationAction();
            setLoading(false);
            if (res.ok) toast({ tone: "success", title: res.data.alreadyVerified ? "Already verified" : "Verification email sent", description: email });
            else toast({ tone: "danger", title: res.message });
          }}
        >
          Resend email
        </Button>
      }
    >
      We sent a link to {email}. Verify to unlock bookings and matchmaking.
    </Alert>
  );
}
