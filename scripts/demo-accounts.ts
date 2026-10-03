/** Lists the seeded demo accounts with level and whether they are free to test matchmaking. `npx tsx scripts/demo-accounts.ts` */
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
(async () => {
  const users = await db.user.findMany({
    where: { email: { endsWith: "@example.com" } },
    select: { name: true, email: true, playerProfile: { select: { level: true } }, gameParticipations: { where: { status: { in: ["ACCEPTED", "INVITED"] } }, select: { id: true } }, organizedGames: { select: { id: true } } },
    orderBy: { email: "asc" },
  });
  for (const u of users) {
    const busy = u.gameParticipations.length + u.organizedGames.length;
    console.log(`${(u.playerProfile?.level ?? "-").padEnd(2)}  ${u.email.padEnd(24)} ${u.name.padEnd(16)} ${busy ? `in ${busy} game(s)` : "free to test matchmaking"}`);
  }
  await db.$disconnect();
})();
