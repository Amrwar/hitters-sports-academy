import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { can } from "@/lib/auth/authorize";
import { getMatchmakingConfig } from "@/server/services/matchmaking";
import { ACADEMY_DEFAULTS, getAcademySettings, getEditableAcademySettings } from "@/server/services/academy-settings";
import { getPaymentPolicy } from "@/server/services/payment-policy";
import { onlinePaymentsConfigured } from "@/lib/payments/provider";
import { SettingsView } from "./settings-view";

export const metadata = { title: "Settings" };

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const actor = await requireStaffOrRedirect();
  const [config, canConfigure, canConfigureAcademy, policy] = await Promise.all([getMatchmakingConfig(), can(actor, "matchmaking.configure"), can(actor, "academy.configure"), getPaymentPolicy(null)]);
  // Reading it as an editor creates the row on first visit, so the form always has something real to edit.
  const academy = canConfigureAcademy ? await getEditableAcademySettings(actor).catch(() => ACADEMY_DEFAULTS) : await getAcademySettings();
  return (
    <SettingsView
      matchmaking={{ allowAdjacentLevels: config.allowAdjacentLevels, requestExpiryHours: config.requestExpiryHours, maxOpenRequests: config.maxOpenRequests }}
      academy={academy}
      policy={policy}
      onlineAvailable={onlinePaymentsConfigured()}
      canConfigure={canConfigure}
      canConfigureAcademy={canConfigureAcademy}
    />
  );
}
