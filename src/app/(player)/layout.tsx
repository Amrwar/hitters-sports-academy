import { BottomNav, PlayerTopBar } from "@/components/nav/player-nav";
import { currentUser, notifications } from "@/data/mock";

/** Mobile-first player shell. On larger screens the app stays a centred 480px column on the court backdrop. */
export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <div className="min-h-dvh bg-court">
      <div className="relative mx-auto min-h-dvh max-w-app bg-canvas sm:border-x sm:border-line/10">
        <PlayerTopBar unread={unread} userName={currentUser.name} />
        <main className="px-4 pb-32 pt-5 animate-fade-in">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
