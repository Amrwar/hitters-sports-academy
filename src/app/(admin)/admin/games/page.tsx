import { requireStaffOrRedirect } from "@/lib/auth/cookies";
import { accessibleLocationIds, can } from "@/lib/auth/authorize";
import { listManagedLocations } from "@/server/services/locations";
import { listGamesInScope } from "@/server/services/game-sessions";
import { GamesAdmin } from "./games-admin";

export const dynamic = "force-dynamic";

const STATUSES = ["DRAFT", "OPEN", "FULL", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

export default async function AdminGamesPage({ searchParams }: { searchParams: Promise<{ location?: string; status?: string; scope?: string }> }) {
  const actor = await requireStaffOrRedirect();
  const sp = await searchParams;
  const [locations, readable] = await Promise.all([listManagedLocations(actor), accessibleLocationIds(actor, "session.read")]);
  const visible = locations.filter((l) => readable === "all" || readable.includes(l.id));
  const selected = visible.find((l) => l.id === sp.location) ?? null;
  const status = STATUSES.includes(sp.status as (typeof STATUSES)[number]) ? (sp.status as (typeof STATUSES)[number]) : null;
  const scope = sp.scope === "all" ? "all" : "upcoming";
  const result = visible.length ? await listGamesInScope(actor, { locationId: selected?.id, status: status ?? undefined, scope }).catch(() => ({ items: [], total: 0 })) : { items: [], total: 0 };
  const manageable = await Promise.all(visible.map(async (l) => [l.id, await can(actor, "session.manage", { locationId: l.id })] as const));
  return (
    <GamesAdmin
      locations={visible.map((l) => ({ id: l.id, name: l.name, timezone: l.timezone }))}
      selectedId={selected?.id ?? null}
      status={status}
      scope={scope}
      items={result.items}
      total={result.total}
      canManage={Object.fromEntries(manageable)}
    />
  );
}
