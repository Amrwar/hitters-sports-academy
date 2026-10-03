/** Sanity check: do the seeded accounts exist and accept the development password? `npx tsx scripts/check-login.ts` */
import { PrismaClient } from "@prisma/client";
import { verifyPassword } from "../src/lib/auth/password";
const db = new PrismaClient();
async function main() {
  for (const email of ["admin@hitters.academy", "amr@example.com", "coach.ahmed@hitters.academy"]) {
    const u = await db.user.findUnique({ where: { email }, select: { status: true, emailVerifiedAt: true, passwordHash: true } });
    console.log(email, u ? { status: u.status, verified: !!u.emailVerifiedAt, passwordOk: await verifyPassword("HittersDev!2026", u.passwordHash) } : "MISSING");
  }
  console.log("users total:", await db.user.count());
}
main().finally(() => db.$disconnect());
