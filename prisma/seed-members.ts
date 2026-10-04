/**
 * A realistic membership for the demo database.
 *
 * Without it the academy reads as sixteen people making fifteen hundred bookings a month, which is the
 * first thing anyone notices on the dashboard. These are ordinary members: a level, a home club, a joining
 * date somewhere in the last thirty weeks, and nothing else. They never hold a staff role.
 *
 * Idempotent: every account it writes lives on the demo domain below and it does nothing if any exist.
 * All of them share the development password, so any of them can be signed into during a walkthrough.
 */
import type { PrismaClient, PlayerLevel, Prisma } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { PREFERRED_TIME_KEYS } from "../src/lib/catalog";

const DOMAIN = "members.hitters.demo";
const COUNT = 170;
const WEEKS = 30;

const FIRST_NAMES = [
  "Ahmed", "Mohamed", "Mahmoud", "Youssef", "Omar", "Karim", "Khaled", "Tarek", "Hassan", "Hussein",
  "Amr", "Sherif", "Ziad", "Adham", "Seif", "Marwan", "Ali", "Mostafa", "Islam", "Bassem",
  "Nour", "Salma", "Mariam", "Yasmin", "Farida", "Dina", "Hana", "Laila", "Nada", "Rana",
  "Menna", "Habiba", "Aya", "Sara", "Nourhan", "Alia", "Jana", "Malak", "Reem", "Dalia",
];
const LAST_NAMES = [
  "Hassan", "Ibrahim", "Fahmy", "El Sayed", "Abdelrahman", "Shawky", "Mansour", "Kamal", "Said", "Rizk",
  "El Gammal", "Nasr", "Zaki", "Badr", "Fouad", "Sorour", "Helmy", "Lotfy", "Ezzat", "Darwish",
  "El Sherbiny", "Ramzy", "Awad", "Gaber", "Hegazy", "Shoukry", "Abdelaziz", "Sabry", "Yehia", "Attia",
];

/** How the membership of a club that assesses everyone actually sits: a wide middle, few at either end. */
const LEVELS: (PlayerLevel | null)[] = [
  ...Array<PlayerLevel>(10).fill("A"),
  ...Array<PlayerLevel>(28).fill("B"),
  ...Array<PlayerLevel>(36).fill("C"),
  ...Array<PlayerLevel>(16).fill("D"),
  ...Array<null>(10).fill(null),
];

const SIDES = ["RIGHT", "LEFT", "BOTH"] as const;
const MATCH_TYPES = ["ANY", "COMPETITIVE", "FRIENDLY"] as const;

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export async function seedMembers(db: PrismaClient, password: string): Promise<{ created: number; skipped: boolean }> {
  if (await db.user.count({ where: { email: { endsWith: `@${DOMAIN}` } } })) return { created: 0, skipped: true };

  const locations = await db.location.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  if (locations.length === 0) return { created: 0, skipped: true };

  const passwordHash = await hashPassword(password);
  const random = rng(20261004);
  const now = Date.now();
  const used = new Set<string>();
  const users: Prisma.UserCreateManyInput[] = [];
  const profiles: { email: string; data: Omit<Prisma.PlayerProfileCreateManyInput, "userId"> }[] = [];

  for (let i = 0; i < COUNT; i++) {
    const first = FIRST_NAMES[Math.floor(random() * FIRST_NAMES.length)]!;
    const last = LAST_NAMES[Math.floor(random() * LAST_NAMES.length)]!;
    const slug = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "");
    let email = `${slug}@${DOMAIN}`;
    for (let n = 2; used.has(email); n++) email = `${slug}${n}@${DOMAIN}`;
    used.add(email);

    // Joining dates spread across the history and weighted towards recent weeks, so "new members this
    // period" is a figure that moves rather than a flat line.
    const weeksAgo = Math.floor(WEEKS * random() * random());
    const joined = new Date(now - weeksAgo * 7 * 86_400_000 - Math.floor(random() * 86_400_000));
    const level = LEVELS[Math.floor(random() * LEVELS.length)]!;

    users.push({
      email,
      name: `${first} ${last}`,
      phone: `+2010${Math.floor(10_000_000 + random() * 89_999_999)}`,
      passwordHash,
      emailVerifiedAt: random() < 0.94 ? joined : null,
      createdAt: joined,
    });
    profiles.push({
      email,
      data: {
        level,
        levelUpdatedAt: level ? new Date(joined.getTime() + 7 * 86_400_000) : null,
        selfLevel: level,
        photoUrl: `https://i.pravatar.cc/240?u=${encodeURIComponent(email)}`,
        side: SIDES[Math.floor(random() * SIDES.length)]!,
        matchType: MATCH_TYPES[Math.floor(random() * MATCH_TYPES.length)]!,
        yearsPlaying: 1 + Math.floor(random() * 9),
        preferredTimes: PREFERRED_TIME_KEYS.filter(() => random() < 0.35),
        homeLocationId: locations[Math.floor(random() * locations.length)]!.id,
        createdAt: joined,
      },
    });
  }

  for (let i = 0; i < users.length; i += 200) await db.user.createMany({ data: users.slice(i, i + 200), skipDuplicates: true });

  const created = await db.user.findMany({ where: { email: { endsWith: `@${DOMAIN}` } }, select: { id: true, email: true } });
  const byEmail = new Map(created.map((u) => [u.email, u.id]));
  const profileRows = profiles.flatMap((p) => {
    const userId = byEmail.get(p.email);
    return userId ? [{ ...p.data, userId }] : [];
  });
  for (let i = 0; i < profileRows.length; i += 200) await db.playerProfile.createMany({ data: profileRows.slice(i, i + 200), skipDuplicates: true });

  return { created: created.length, skipped: false };
}
