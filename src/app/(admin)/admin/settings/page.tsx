import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { can } from "@/lib/auth/authorize";
import { getMatchmakingConfig } from "@/server/services/matchmaking";
import { SettingsView } from "./settings-view";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const actor = await requireStaffOrRedirect();
  const [config, canConfigure] = await Promise.all([getMatchmakingConfig(), can(actor, "matchmaking.configure")]);
  return <SettingsView matchmaking={{ allowAdjacentLevels: config.allowAdjacentLevels, requestExpiryHours: config.requestExpiryHours, maxOpenRequests: config.maxOpenRequests }} canConfigure={canConfigure} />;
}
