import { BottomNav, PlayerTopBar } from "@/components/nav/player-nav";
import { requireActorOrRedirect } from "@/lib/auth/cookies";
import { db } from "@/lib/db";
import { VerifyBanner } from "./verify-banner";

export const dynamic = "force-dynamic";

/** Mobile-first player shell. Requires a signed-in, active account. */
export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActorOrRedirect("/app");
  const unread = await db.notification.count({ where: { userId: actor.id, channel: "IN_APP", readAt: null } });
  return (
    <div className="min-h-dvh bg-court">
      <div className="relative mx-auto min-h-dvh max-w-app bg-canvas sm:border-x sm:border-line/10">
        <PlayerTopBar unread={unread} userName={actor.name} />
        <main className="px-4 pb-32 pt-5">
          {!actor.emailVerifiedAt && <VerifyBanner email={actor.email} />}
          {children}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
