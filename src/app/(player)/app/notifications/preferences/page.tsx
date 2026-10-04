import { PageHeader } from "@/components/nav/player-nav";
import { Alert } from "@/components/ui/alert";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { getMyPreferences } from "@/server/services/notifications";
import { PreferencesForm } from "./preferences-form";

export const metadata = { title: "Notification preferences" };

export default async function NotificationPreferencesPage() {
  const actor = await requireActorOrRedirect("/app/notifications/preferences");
  const rows = await getMyPreferences(actor);
  return (
    <div className="space-y-5">
      <PageHeader back="/app/notifications" title="Notification preferences" />
      <Alert tone="info" title="You choose what reaches you">
        Turn a channel off for a category and we stop sending it. Anything about a booking or lesson you have already paid for still appears in the app.
      </Alert>
      <PreferencesForm initial={rows} />
    </div>
  );
}
