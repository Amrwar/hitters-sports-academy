import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { can } from "@/lib/auth/authorize";
import { getMatchmakingConfig } from "@/server/services/matchmaking";
import { ACADEMY_DEFAULTS, getAcademySettings, getEditableAcademySettings } from "@/server/services/academy-settings";
import { SettingsView } from "./settings-view";

export const metadata = { title: "Settings" };

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const actor = await requireStaffOrRedirect();
  const [config, canConfigure, canConfigureAcademy] = await Promise.all([getMatchmakingConfig(), can(actor, "matchmaking.configure"), can(actor, "academy.configure")]);
  // Reading it as an editor creates the row on first visit, so the form always has something real to edit.
  const academy = canConfigureAcademy ? await getEditableAcademySettings(actor).catch(() => ACADEMY_DEFAULTS) : await getAcademySettings();
  return (
    <SettingsView
      matchmaking={{ allowAdjacentLevels: config.allowAdjacentLevels, requestExpiryHours: config.requestExpiryHours, maxOpenRequests: config.maxOpenRequests }}
      academy={academy}
      canConfigure={canConfigure}
      canConfigureAcademy={canConfigureAcademy}
    />
  );
}
