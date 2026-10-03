import type { LevelDefinition, PlayerLevel } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { validation } from "@/lib/errors";
import { requirePermission, type Actor } from "@/lib/auth/authorize";
import { levelDefinitionsSchema } from "@/lib/validation/schemas";

/**
 * Official level configuration. Ordering (rank 1 = strongest) and wording are admin-configurable;
 * nothing in the codebase assumes which letter is highest.
 */
export const DEFAULT_LEVELS: Omit<LevelDefinition, "updatedAt">[] = [
  { level: "A", rank: 1, label: "Advanced", description: "Consistent, tactical doubles play with confident net game and attacking smashes." },
  { level: "B", rank: 2, label: "Intermediate+", description: "Reliable rallies, uses the walls well, beginning to control points with lobs and volleys." },
  { level: "C", rank: 3, label: "Intermediate", description: "Comfortable with the basics, developing positioning and consistency under pressure." },
  { level: "D", rank: 4, label: "Beginner", description: "New to padel or still learning grip, serve and court movement." },
];

let cache: { rows: LevelDefinition[]; at: number } | null = null;

export async function getLevelDefinitions(force = false): Promise<LevelDefinition[]> {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.rows;
  let rows = await db.levelDefinition.findMany({ orderBy: { rank: "asc" } });
  if (rows.length < 4) {
    await db.levelDefinition.createMany({ data: DEFAULT_LEVELS, skipDuplicates: true });
    rows = await db.levelDefinition.findMany({ orderBy: { rank: "asc" } });
  }
  cache = { rows, at: Date.now() };
  return rows;
}

export function invalidateLevelCache() {
  cache = null;
}

export type LevelMap = Record<PlayerLevel, LevelDefinition>;

export async function getLevelMap(): Promise<LevelMap> {
  const rows = await getLevelDefinitions();
  return Object.fromEntries(rows.map((r) => [r.level, r])) as LevelMap;
}

/** Replaces the four definitions. Global roles only (levels.configure). Ranks must be a permutation of 1..4. */
export async function updateLevelDefinitions(actor: Actor | null, input: unknown): Promise<LevelDefinition[]> {
  const a = await requirePermission(actor, "levels.configure");
  const parsed = levelDefinitionsSchema.safeParse(input);
  if (!parsed.success) throw validation(parsed.error.issues[0]?.message ?? "Check the level definitions.");
  const rows = parsed.data;
  const levels = new Set(rows.map((r) => r.level));
  const ranks = rows.map((r) => r.rank).sort((x, y) => x - y);
  if (levels.size !== 4 || ranks.join(",") !== "1,2,3,4") throw validation("Provide all four levels with ranks 1 to 4, each used once.");
  const before = await getLevelDefinitions(true);
  const updated = await db.$transaction(async (tx) => {
    // Two-phase update avoids transient unique-rank collisions when swapping order.
    for (const r of rows) await tx.levelDefinition.upsert({ where: { level: r.level }, create: { ...r, rank: r.rank + 100 }, update: { ...r, rank: r.rank + 100 } });
    for (const r of rows) await tx.levelDefinition.update({ where: { level: r.level }, data: { rank: r.rank } });
    await audit({ actorId: a.id, action: "levels.configured", entityType: "LevelDefinition", metadata: { before: before.map((b) => `${b.level}:${b.rank}:${b.label}`), after: rows.map((r) => `${r.level}:${r.rank}:${r.label}`) } }, tx);
    return tx.levelDefinition.findMany({ orderBy: { rank: "asc" } });
  });
  invalidateLevelCache();
  return updated;
}
