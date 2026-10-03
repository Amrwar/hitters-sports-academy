/**
 * Sanity check: do the seeded accounts exist and accept the seed password?
 *   npx tsx scripts/check-login.ts
 * Set DATABASE_URL to point at another environment and SEED_PASSWORD when it was seeded with one.
 */
import { PrismaClient } from "@prisma/client";
import { verifyPassword } from "../src/lib/auth/password";
const db = new PrismaClient();
const password = process.env.SEED_PASSWORD?.trim() || "HittersDev!2026";
async function main() {
  for (const email of ["admin@hitters.academy", "amr@example.com", "coach.ahmed@hitters.academy"]) {
    const u = await db.user.findUnique({ where: { email }, select: { status: true, emailVerifiedAt: true, passwordHash: true } });
    console.log(email, u ? { status: u.status, verified: !!u.emailVerifiedAt, passwordOk: await verifyPassword(password, u.passwordHash) } : "MISSING");
  }
  const [users, locations, courts, games, programs] = await Promise.all([db.user.count(), db.location.count(), db.court.count(), db.gameSession.count(), db.program.count()]);
  console.log({ users, locations, courts, games, programs });
}
main().finally(() => db.$disconnect());
