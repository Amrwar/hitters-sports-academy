/**
 * Development seed. Idempotent: safe to run repeatedly.
 * Creates the permission matrix, four locations with courts and availability, one account per role,
 * sample players with assessments, demo bookings with games, and a few notifications.
 *
 * All seeded accounts share the development password below. Change it before any shared deployment.
 */
import { PrismaClient, type CourtType, type PlayerLevel, type Prisma, type StaffRole } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { seedRolePermissions } from "../src/server/services/permissions-seed";
import { DEFAULT_LEVELS } from "../src/server/services/levels";

const db = new PrismaClient();
/** Shared password for every seeded account. Override with SEED_PASSWORD when seeding anything reachable from the internet. */
export const DEV_PASSWORD = process.env.SEED_PASSWORD?.trim() || "HittersDev!2026";

const HOURS_ALL_WEEK = Array.from({ length: 7 }, () => ({ opensAt: 7 * 60, closesAt: 24 * 60 }));
const DESCRIPTIONS: Record<string, string> = {
  "new-cairo": "Our flagship club: eight courts including four panoramic glass courts, a pro shop, café and full coaching academy in the heart of the Fifth Settlement.",
  "sheikh-zayed": "Six fully air-conditioned indoor courts, perfect for summer play, with physio and lounge facilities at Arkan Plaza.",
  maadi: "Four outdoor courts under the Degla trees. Home of the HITTERS Junior Academy.",
  "north-coast": "Seasonal beach-side club in Marassi with panoramic courts and a sunset lounge.",
};
const FACILITIES_BY_SLUG: Record<string, string[]> = {
  "new-cairo": ["parking", "showers", "lockers", "cafe", "pro_shop", "coaching", "equipment_rental", "wifi"],
  "sheikh-zayed": ["parking", "indoor_ac", "cafe", "lockers", "physio", "lounge", "wifi"],
  maadi: ["parking", "cafe", "lockers", "kids_area", "coaching"],
  "north-coast": ["parking", "lounge", "showers", "equipment_rental", "accessible"],
};
const PHOTOS = ["/brand/court-net.jpg", "/brand/court-rackets.jpg", "/brand/court-line.jpg", "/brand/court-handles.jpg"];

const LOCATIONS = [
  { slug: "new-cairo", name: "HITTERS New Cairo", city: "Cairo", area: "Fifth Settlement", address: "90th St, Fifth Settlement, New Cairo", phone: "+20220000000", courts: [["Court 1", "PANORAMIC"], ["Court 2", "PANORAMIC"], ["Court 3", "INDOOR"], ["Court 4", "INDOOR"], ["Court 5", "OUTDOOR"], ["Court 6", "OUTDOOR"]], price: 45000 },
  { slug: "sheikh-zayed", name: "HITTERS Sheikh Zayed", city: "Giza", area: "Sheikh Zayed", address: "Arkan Plaza, Sheikh Zayed", phone: "+20238000000", courts: [["Court 1", "INDOOR"], ["Court 2", "INDOOR"], ["Court 3", "INDOOR"], ["Court 4", "INDOOR"], ["Court 5", "INDOOR"], ["Court 6", "INDOOR"]], price: 50000 },
  { slug: "maadi", name: "HITTERS Maadi", city: "Cairo", area: "Degla", address: "Road 233, Degla, Maadi", phone: "+20225000000", courts: [["Court 1", "OUTDOOR"], ["Court 2", "OUTDOOR"], ["Court 3", "OUTDOOR"], ["Court 4", "OUTDOOR"]], price: 40000 },
  { slug: "north-coast", name: "HITTERS North Coast", city: "Marassi", area: "Sidi Abdel Rahman", address: "Marassi Marina, North Coast", phone: "+20460000000", courts: [["Court 1", "PANORAMIC"], ["Court 2", "PANORAMIC"], ["Court 3", "PANORAMIC"], ["Court 4", "OUTDOOR"], ["Court 5", "OUTDOOR"]], price: 60000 },
] as const;

type SeedUser = { email: string; name: string; phone?: string; globalRole?: "SUPER_ADMIN" | "ACADEMY_OWNER"; staff?: [string, StaffRole][]; level?: PlayerLevel; home?: string; verified?: boolean };

const USERS: SeedUser[] = [
  { email: "admin@hitters.academy", name: "HITTERS Admin", globalRole: "SUPER_ADMIN", verified: true },
  { email: "owner@hitters.academy", name: "Academy Owner", globalRole: "ACADEMY_OWNER", verified: true },
  { email: "manager.newcairo@hitters.academy", name: "Mona Manager", staff: [["new-cairo", "LOCATION_MANAGER"]], verified: true },
  { email: "manager.zayed@hitters.academy", name: "Ziad Manager", staff: [["sheikh-zayed", "LOCATION_MANAGER"]], verified: true },
  { email: "reception.newcairo@hitters.academy", name: "Rana Reception", staff: [["new-cairo", "RECEPTIONIST"]], verified: true },
  { email: "coach.ahmed@hitters.academy", name: "Ahmed Samir", staff: [["new-cairo", "TRAINER"], ["maadi", "TRAINER"]], verified: true },
  { email: "assessor.newcairo@hitters.academy", name: "Aya Assessor", staff: [["new-cairo", "ASSESSOR"]], verified: true },
  { email: "finance@hitters.academy", name: "Farid Finance", staff: [["new-cairo", "FINANCE_MANAGER"], ["sheikh-zayed", "FINANCE_MANAGER"]], verified: true },
  { email: "amr@example.com", name: "Amr Hefny", phone: "+201000000001", level: "B", home: "new-cairo", verified: true },
  { email: "omar@example.com", name: "Omar Farouk", phone: "+201000000002", level: "A", home: "new-cairo", verified: true },
  { email: "laila@example.com", name: "Laila Mansour", phone: "+201000000003", level: "B", home: "sheikh-zayed", verified: true },
  { email: "karim@example.com", name: "Karim Adel", phone: "+201000000004", level: "C", home: "new-cairo", verified: true },
  { email: "salma@example.com", name: "Salma Youssef", phone: "+201000000005", level: "A", home: "new-cairo", verified: true },
  { email: "youssef@example.com", name: "Youssef Tarek", phone: "+201000000006", home: "sheikh-zayed", verified: false },
];

async function main() {
  const perms = await seedRolePermissions(db);
  console.log(`permissions: ${perms.total} grants (${perms.removed} stale removed)`);
  await db.levelDefinition.createMany({ data: DEFAULT_LEVELS, skipDuplicates: true });

  const locationIds = new Map<string, string>();
  for (const l of LOCATIONS) {
    const loc = await db.location.upsert({
      where: { slug: l.slug },
      create: { slug: l.slug, name: l.name, city: l.city, area: l.area, address: l.address, phone: l.phone, status: "ACTIVE", description: DESCRIPTIONS[l.slug], facilities: FACILITIES_BY_SLUG[l.slug], openingHours: HOURS_ALL_WEEK, timezone: "Africa/Cairo" },
      update: { name: l.name, city: l.city, area: l.area, address: l.address, phone: l.phone, description: DESCRIPTIONS[l.slug], facilities: FACILITIES_BY_SLUG[l.slug], openingHours: HOURS_ALL_WEEK },
    });
    locationIds.set(l.slug, loc.id);
    await db.bookingPolicy.upsert({ where: { locationId: loc.id }, create: { locationId: loc.id, advanceBookingDays: 14, minNoticeMinutes: 60, cancellationCutoffHours: 12 }, update: {} });
    if ((await db.locationPhoto.count({ where: { locationId: loc.id } })) === 0) {
      const idx = LOCATIONS.findIndex((x) => x.slug === l.slug);
      await db.locationPhoto.createMany({ data: [0, 1].map((k) => ({ locationId: loc.id, url: PHOTOS[(idx + k) % PHOTOS.length], alt: `${l.name} court`, sortOrder: k })) });
    }
    // Pricing rules (location-wide). Seed owns these rows: migrated per-court peak rows are replaced.
    await db.pricingRule.deleteMany({ where: { locationId: loc.id, OR: [{ courtId: { not: null }, name: "Peak hours" }, { name: { in: ["Peak hours", "Weekend", "HITTER Pro members"] } }] } });
    await db.pricingRule.createMany({
      data: [
        { locationId: loc.id, name: "Peak hours", kind: "PEAK", daysOfWeek: [], startsAt: 18 * 60, endsAt: 21 * 60, adjustmentPercent: 25, priority: 100 },
        { locationId: loc.id, name: "Weekend", kind: "WEEKEND", daysOfWeek: [5, 6], adjustmentPercent: 10, priority: 110 },
        { locationId: loc.id, name: "HITTER Pro members", kind: "MEMBERSHIP_DISCOUNT", membershipTier: "PRO", adjustmentPercent: -15, priority: 200 },
      ],
    });
    for (const [i, [name, type]] of l.courts.entries()) {
      const court = await db.court.upsert({
        where: { locationId_name: { locationId: loc.id, name } },
        create: { locationId: loc.id, name, type: type as CourtType, sortOrder: i, status: l.slug === "new-cairo" && name === "Court 4" ? "MAINTENANCE" : "ACTIVE" },
        update: { type: type as CourtType, sortOrder: i },
      });
      // 07:00 - 24:00 every day, 60 min slots. Peak/weekend/member pricing comes from PricingRule.
      for (let day = 0; day < 7; day++) {
        await db.courtAvailability.upsert({
          where: { courtId_dayOfWeek_opensAt: { courtId: court.id, dayOfWeek: day, opensAt: 7 * 60 } },
          create: { courtId: court.id, dayOfWeek: day, opensAt: 7 * 60, closesAt: 24 * 60, slotMinutes: 60, priceCents: l.price },
          update: { closesAt: 24 * 60, priceCents: l.price },
        });
      }
    }
  }
  console.log(`locations: ${locationIds.size}`);

  const passwordHash = await hashPassword(DEV_PASSWORD);
  const userIds = new Map<string, string>();
  for (const u of USERS) {
    const user = await db.user.upsert({
      where: { email: u.email },
      create: { email: u.email, name: u.name, phone: u.phone, passwordHash, globalRole: u.globalRole ?? null, emailVerifiedAt: u.verified ? new Date() : null, playerProfile: { create: { homeLocationId: u.home ? locationIds.get(u.home) : undefined } } },
      update: { name: u.name, globalRole: u.globalRole ?? null, passwordHash },
    });
    userIds.set(u.email, user.id);
    for (const [slug, role] of u.staff ?? []) {
      await db.staffMembership.upsert({
        where: { userId_locationId_role: { userId: user.id, locationId: locationIds.get(slug)!, role } },
        create: { userId: user.id, locationId: locationIds.get(slug)!, role, createdById: userIds.get("admin@hitters.academy") },
        update: { status: "ACTIVE" },
      });
    }
  }
  console.log(`users: ${userIds.size}`);

  // Assessments by the New Cairo assessor set player levels.
  const assessorId = userIds.get("assessor.newcairo@hitters.academy")!;
  for (const u of USERS) {
    if (!u.level) continue;
    const profile = await db.playerProfile.findUniqueOrThrow({ where: { userId: userIds.get(u.email)! } });
    if (profile.level) continue;
    const locationId = locationIds.get("new-cairo")!;
    await db.$transaction([
      db.assessment.create({ data: { playerProfileId: profile.id, assessorId, locationId, level: u.level, previousLevel: null, notes: "Initial placement (seed)", scores: { serve: 7, volley: 6, bandeja: 6, movement: 7 } } }),
      db.playerProfile.update({ where: { id: profile.id }, data: { level: u.level, levelUpdatedAt: new Date() } }),
      db.notification.create({ data: { userId: profile.userId, type: "assessment.completed", title: `You've been placed at Level ${u.level}`, body: "Assessed at HITTERS New Cairo. Keep climbing.", data: { level: u.level } } }),
    ]);
  }
  console.log("assessments: done");
  // A pending assessment request so the admin queue is not empty.
  const youssef = await db.playerProfile.findUniqueOrThrow({ where: { userId: userIds.get("youssef@example.com")! } });
  if ((await db.assessmentRequest.count({ where: { playerProfileId: youssef.id } })) === 0) {
    await db.assessmentRequest.create({ data: { playerProfileId: youssef.id, locationId: locationIds.get("sheikh-zayed")!, kind: "INITIAL", note: "New to padel, played squash before." } });
  }
  // Demo bookings and games so the Play tab, home and admin lists have content. Dates are relative to now.
  const zonedUtc = (daysAhead: number, hour: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + daysAhead);
    d.setUTCHours(hour - 2, 0, 0, 0); // Africa/Cairo is UTC+2 for the seeded clubs
    return d;
  };
  const courtAt = async (slug: string, name: string) => (await db.court.findFirstOrThrow({ where: { locationId: locationIds.get(slug)!, name } })).id;
  const ensureBooking = async (code: string, email: string, slug: string, court: string, daysAhead: number, hour: number, minutes: number, priceCents: number) => {
    const startsAt = zonedUtc(daysAhead, hour);
    const endsAt = new Date(startsAt.getTime() + minutes * 60_000);
    const playerId = userIds.get(email)!;
    const courtId = await courtAt(slug, court);
    const existing = await db.booking.findUnique({ where: { confirmationCode: code } });
    if (existing) return existing;
    return db.booking.create({
      data: { confirmationCode: code, courtId, locationId: locationIds.get(slug)!, playerId, startsAt, endsAt, durationMinutes: minutes, status: "CONFIRMED", priceCents, createdById: playerId, participants: { create: [{ userId: playerId, role: "ORGANIZER" }] }, payments: { create: { amountCents: priceCents, status: "PENDING", method: "NONE" } } },
    });
  };
  const ensureGame = async (code: string, bookingId: string, email: string, data: Omit<Prisma.GameSessionUncheckedCreateInput, "code" | "bookingId" | "organizerId" | "locationId" | "courtId" | "startsAt" | "endsAt">, lineup: { email: string; status: "ACCEPTED" | "INVITED" }[]) => {
    if (await db.gameSession.findUnique({ where: { code } })) return;
    const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    const organizerId = userIds.get(email)!;
    await db.gameSession.create({
      data: {
        code,
        bookingId,
        organizerId,
        locationId: b.locationId,
        courtId: b.courtId,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        ...data,
        participants: { create: [{ userId: organizerId, role: "ORGANIZER", status: "ACCEPTED", invitedById: organizerId, respondedAt: new Date() }, ...lineup.map((l) => ({ userId: userIds.get(l.email)!, role: "PLAYER" as const, status: l.status, invitedById: organizerId, respondedAt: l.status === "ACCEPTED" ? new Date() : null }))] },
      },
    });
    for (const l of lineup) {
      if (l.status === "INVITED") await db.notification.create({ data: { userId: userIds.get(l.email)!, type: "game.invited", title: `${USERS.find((u) => u.email === email)!.name} invited you to a game`, body: `${LOCATIONS.find((x) => x.slug === (LOCATIONS.find((y) => locationIds.get(y.slug) === b.locationId)?.slug ?? "new-cairo"))!.name}`, data: { code } } });
    }
  };
  const bOmar = await ensureBooking("HT-SEED01", "omar@example.com", "new-cairo", "Court 1", 1, 19, 90, 67500);
  const bAmr = await ensureBooking("HT-SEED02", "amr@example.com", "new-cairo", "Court 3", 2, 20, 60, 45000);
  const bLaila = await ensureBooking("HT-SEED03", "laila@example.com", "sheikh-zayed", "Court 2", 3, 18, 90, 75000);
  const bSalma = await ensureBooking("HT-SEED04", "salma@example.com", "maadi", "Court 1", 4, 9, 60, 40000);
  await ensureGame("GM-SEED01", bOmar.id, "omar@example.com", { format: "DOUBLES", maxPlayers: 4, levels: ["A", "B"], matchType: "COMPETITIVE", visibility: "PUBLIC", status: "OPEN", openToRequests: true, costMode: "SPLIT_EVENLY", description: "Tuesday night doubles, fast pace", notes: "Meet at reception 10 minutes early. I bring balls.", publishedAt: new Date() }, [
    { email: "salma@example.com", status: "ACCEPTED" },
    { email: "amr@example.com", status: "INVITED" },
  ]);
  await ensureGame("GM-SEED02", bAmr.id, "amr@example.com", { format: "DOUBLES", maxPlayers: 4, levels: ["B", "C"], matchType: "FRIENDLY", visibility: "PRIVATE", status: "DRAFT", costMode: "SPLIT_EVENLY", description: "Friendly doubles after work" }, [{ email: "karim@example.com", status: "INVITED" }]);
  await ensureGame("GM-SEED03", bLaila.id, "laila@example.com", { format: "DOUBLES", maxPlayers: 4, levels: ["B"], matchType: "ANY", visibility: "PUBLIC", status: "OPEN", openToRequests: true, costMode: "FIXED_PER_PLAYER", costPerPlayerCents: 20000, description: "Zayed Thursday doubles", publishedAt: new Date() }, []);
  await ensureGame("GM-SEED04", bSalma.id, "salma@example.com", { format: "SINGLES", maxPlayers: 2, levels: ["A"], matchType: "COMPETITIVE", visibility: "PUBLIC", status: "FULL", costMode: "ORGANIZER_PAYS", description: "Morning singles, Maadi", publishedAt: new Date() }, [{ email: "omar@example.com", status: "ACCEPTED" }]);
  console.log("games: done");

  // Matchmaking demo: confirmed pairs, a game of Amr's with a pending request, and a pair challenge.
  const ensurePair = async (a: string, b: string, name: string) => {
    const [playerAId, playerBId] = [userIds.get(a)!, userIds.get(b)!].sort();
    return db.pair.upsert({ where: { playerAId_playerBId: { playerAId, playerBId } }, create: { playerAId, playerBId, createdById: userIds.get(a)!, name, status: "ACTIVE" }, update: { status: "ACTIVE", name } });
  };
  const pairOmarSalma = await ensurePair("omar@example.com", "salma@example.com", "Smash Bros");
  const pairAmrKarim = await ensurePair("amr@example.com", "karim@example.com", "Degla Lobs");
  await db.matchmakingConfig.upsert({ where: { id: "default" }, create: { id: "default", allowAdjacentLevels: true }, update: {} });
  const bAmr2 = await ensureBooking("HT-SEED05", "amr@example.com", "new-cairo", "Court 5", 3, 20, 90, 67500);
  await ensureGame("GM-SEED06", bAmr2.id, "amr@example.com", { format: "DOUBLES", maxPlayers: 4, levels: ["B"], levelPolicy: "ADJACENT", matchType: "FRIENDLY", visibility: "PUBLIC", status: "OPEN", openToRequests: true, costMode: "SPLIT_EVENLY", description: "Thursday social doubles", notes: "Court 5 is outdoor, bring a cap.", publishedAt: new Date() }, [{ email: "karim@example.com", status: "ACCEPTED" }]);
  const gAmr2 = await db.gameSession.findUniqueOrThrow({ where: { code: "GM-SEED06" } });
  await db.gameJoinRequest.upsert({
    where: { sessionId_userId: { sessionId: gAmr2.id, userId: userIds.get("laila@example.com")! } },
    create: { sessionId: gAmr2.id, userId: userIds.get("laila@example.com")!, kind: "SOLO", spots: 1, status: "PENDING", message: "Right side, happy to split the court.", score: 40 + 25 + 10 + 4, reasons: ["Level B match", "Preferred location", "One of your preferred times", "2 spots remaining"], expiresAt: gAmr2.startsAt },
    update: {},
  });
  await db.notification.create({ data: { userId: userIds.get("amr@example.com")!, type: "game.request", title: "Laila Mansour asked to join your game", body: "Level B match · Preferred location · GM-SEED06", data: { code: "GM-SEED06" } } });
  const bOmar2 = await ensureBooking("HT-SEED06", "omar@example.com", "new-cairo", "Court 2", 5, 19, 90, 67500);
  await ensureGame("GM-SEED07", bOmar2.id, "omar@example.com", { format: "DOUBLES", maxPlayers: 4, levels: ["A", "B"], matchType: "COMPETITIVE", visibility: "PUBLIC", status: "OPEN", openToRequests: true, joinPolicy: "PAIRS_ONLY", pairId: pairOmarSalma.id, costMode: "SPLIT_EVENLY", description: "Challenge: Smash Bros want opponents", publishedAt: new Date() }, [{ email: "salma@example.com", status: "ACCEPTED" }]);
  await db.gameParticipant.updateMany({ where: { sessionId: (await db.gameSession.findUniqueOrThrow({ where: { code: "GM-SEED07" } })).id, userId: { in: [userIds.get("omar@example.com")!, userIds.get("salma@example.com")!] } }, data: { pairId: pairOmarSalma.id } });
  void pairAmrKarim;
  console.log("matchmaking: done");

  // Academy demo: coaching profiles, weekly availability, a lesson, two programs, packages and a purchase.
  const ensureTrainer = async (email: string, data: Omit<Prisma.TrainerProfileUncheckedCreateInput, "userId">, slugs: string[], hours: { dayOfWeek: number; startMinutes: number; endMinutes: number }[]) => {
    const userId = userIds.get(email)!;
    const t = await db.trainerProfile.upsert({ where: { userId }, create: { userId, ...data }, update: {} });
    for (const slug of slugs) await db.trainerLocation.upsert({ where: { trainerId_locationId: { trainerId: t.id, locationId: locationIds.get(slug)! } }, create: { trainerId: t.id, locationId: locationIds.get(slug)! }, update: {} });
    if ((await db.trainerAvailability.count({ where: { trainerId: t.id } })) === 0) {
      await db.trainerAvailability.createMany({ data: hours.map((h) => ({ trainerId: t.id, locationId: locationIds.get(slugs[0])!, ...h })) });
    }
    return t;
  };
  const ahmed = await ensureTrainer(
    "coach.ahmed@hitters.academy",
    { title: "Head coach · FIP Level 2", bio: "12 years on the professional circuit in Spain. Builds complete players from footwork up, with a soft spot for the bandeja.", qualifications: ["FIP Level 2", "PTR Padel Professional"], languages: ["Arabic", "English", "Spanish"], specialties: ["Technique", "Match tactics", "Competition prep"], levels: ["A", "B"], hourlyRateCents: 90000, durationsMinutes: [60, 90], autoConfirm: true, yearsExperience: 12 },
    ["new-cairo", "maadi"],
    [1, 2, 3, 4].map((dayOfWeek) => ({ dayOfWeek, startMinutes: 16 * 60, endMinutes: 21 * 60 })).concat([{ dayOfWeek: 6, startMinutes: 9 * 60, endMinutes: 13 * 60 }]),
  );
  // A second coach: the New Cairo assessor also coaches beginners on request.
  await db.staffMembership.upsert({ where: { userId_locationId_role: { userId: userIds.get("assessor.newcairo@hitters.academy")!, locationId: locationIds.get("new-cairo")!, role: "TRAINER" } }, create: { userId: userIds.get("assessor.newcairo@hitters.academy")!, locationId: locationIds.get("new-cairo")!, role: "TRAINER" }, update: {} });
  const aya = await ensureTrainer(
    "assessor.newcairo@hitters.academy",
    { title: "Academy coach · juniors and beginners", bio: "Former junior national player. Patient, structured sessions for new players and kids.", qualifications: ["FIP Level 1"], languages: ["Arabic", "English"], specialties: ["Beginners", "Juniors", "Footwork"], levels: [], hourlyRateCents: 60000, durationsMinutes: [60], autoConfirm: false, yearsExperience: 5 },
    ["new-cairo"],
    [0, 1, 2, 3].map((dayOfWeek) => ({ dayOfWeek, startMinutes: 9 * 60, endMinutes: 14 * 60 })),
  );
  const ensureLesson = async (code: string, trainer: { id: string; hourlyRateCents: number }, email: string, slug: string, daysAhead: number, hour: number, minutes: number, focus: string, status: "CONFIRMED" | "REQUESTED" = "CONFIRMED") => {
    if (await db.lesson.findUnique({ where: { code } })) return;
    const startsAt = zonedUtc(daysAhead, hour);
    const endsAt = new Date(startsAt.getTime() + minutes * 60_000);
    const priceCents = Math.round((trainer.hourlyRateCents * minutes) / 60);
    await db.lesson.create({ data: { code, trainerId: trainer.id, playerId: userIds.get(email)!, locationId: locationIds.get(slug)!, startsAt, endsAt, durationMinutes: minutes, status, priceCents, focus, createdById: userIds.get(email)!, payments: { create: { amountCents: priceCents, status: "PENDING", method: "NONE" } } } });
  };
  // Amr's lesson lands on the next weekday evening inside Ahmed's hours (Mon-Thu 16:00-21:00 Cairo).
  const nextWeekday = (() => { for (let d = 1; d < 8; d++) { const dt = new Date(); dt.setUTCDate(dt.getUTCDate() + d); const dow = dt.getUTCDay(); if (dow >= 1 && dow <= 4) return d; } return 1; })();
  await ensureLesson("LS-SEED01", ahmed, "amr@example.com", "new-cairo", nextWeekday, 18, 60, "Bandeja depth and net positioning");
  await ensureLesson("LS-SEED02", aya, "youssef@example.com", "new-cairo", nextWeekday + 1 <= 4 ? nextWeekday + 1 : nextWeekday, 10, 60, "First lesson: grip and serve", "REQUESTED");
  const ensureProgram = async (code: string, data: Omit<Prisma.ProgramUncheckedCreateInput, "code" | "schedule"> & { schedule: { dayOfWeek: number; startMinutes: number; durationMinutes: number }[] }, enroll: string[]) => {
    if (await db.program.findUnique({ where: { code } })) return;
    const tz = "Africa/Cairo";
    const sessions: { startsAt: Date; endsAt: Date }[] = [];
    const start = new Date(data.startsOn as Date);
    for (let i = 0; i < 120 && sessions.length < data.sessionsCount; i++) {
      const day = new Date(start.getTime() + i * 86_400_000);
      for (const s of data.schedule) {
        if (day.getUTCDay() !== s.dayOfWeek || sessions.length >= data.sessionsCount) continue;
        const startsAt = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), Math.floor(s.startMinutes / 60) - 2, s.startMinutes % 60));
        sessions.push({ startsAt, endsAt: new Date(startsAt.getTime() + s.durationMinutes * 60_000) });
      }
    }
    void tz;
    const p = await db.program.create({ data: { code, ...data, schedule: data.schedule, sessions: { create: sessions.map((s, i) => ({ index: i + 1, startsAt: s.startsAt, endsAt: s.endsAt })) } } });
    for (const email of enroll) {
      const e = await db.programEnrollment.create({ data: { programId: p.id, playerId: userIds.get(email)!, status: "ENROLLED", enrolledAt: new Date(), createdById: userIds.get(email)! } });
      await db.payment.create({ data: { enrollmentId: e.id, amountCents: data.priceCents, status: "PENDING", method: "NONE" } });
    }
  };
  const inDays = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); };
  await ensureProgram("PR-SEED01", { name: "Intermediate Tuesdays", category: "INTERMEDIATE", description: "Six weeks of structured doubles work for Level B: positioning, lobs, bandeja and match play every Tuesday evening.", levels: ["B"], trainerId: ahmed.id, locationId: locationIds.get("new-cairo")!, startsOn: inDays(7), endsOn: inDays(60), schedule: [{ dayOfWeek: 2, startMinutes: 19 * 60, durationMinutes: 90 }], sessionsCount: 6, capacity: 8, priceCents: 360000, allowWaitlist: true, enrollmentRules: "Official Level B. Balls and court included.", cancellationRules: "Full refund up to 72 hours before the first session.", status: "OPEN", createdById: userIds.get("manager.newcairo@hitters.academy")! }, ["laila@example.com", "karim@example.com"]);
  await ensureProgram("PR-SEED02", { name: "Junior Academy · Saturdays", category: "JUNIOR", description: "Ages 8 to 14. Fun, safe, progressive coaching with small groups and a tournament at the end.", levels: [], minAge: 8, maxAge: 14, trainerId: aya.id, locationId: locationIds.get("new-cairo")!, startsOn: inDays(5), endsOn: inDays(75), schedule: [{ dayOfWeek: 6, startMinutes: 10 * 60, durationMinutes: 60 }], sessionsCount: 10, capacity: 10, priceCents: 400000, allowWaitlist: true, status: "OPEN", createdById: userIds.get("manager.newcairo@hitters.academy")! }, []);
  await ensureProgram("PR-SEED03", { name: "Competitive Edge", category: "COMPETITIVE", description: "Tournament preparation for Level A: tactics, pressure drills and match analysis.", levels: ["A"], trainerId: ahmed.id, locationId: locationIds.get("maadi")!, startsOn: inDays(10), endsOn: inDays(50), schedule: [{ dayOfWeek: 6, startMinutes: 11 * 60, durationMinutes: 120 }], sessionsCount: 4, capacity: 4, priceCents: 320000, allowWaitlist: true, status: "OPEN", createdById: userIds.get("manager.newcairo@hitters.academy")! }, ["omar@example.com", "salma@example.com"]);
  const ensurePackage = async (name: string, data: Omit<Prisma.TrainingPackageUncheckedCreateInput, "name">) => (await db.trainingPackage.findFirst({ where: { name } })) ?? db.trainingPackage.create({ data: { name, ...data } });
  const five = await ensurePackage("5 lessons", { description: "Five private lessons with any coach, valid 90 days.", credits: 5, priceCents: 400000, validityDays: 90 });
  await ensurePackage("10 lessons", { description: "Ten private lessons with any coach, valid 180 days.", credits: 10, priceCents: 750000, validityDays: 180 });
  await ensurePackage("Ahmed intensive 3", { description: "Three 90-minute sessions with Coach Ahmed at New Cairo.", credits: 3, priceCents: 360000, validityDays: 45, trainerId: ahmed.id, locationId: locationIds.get("new-cairo")! });
  if (!(await db.packagePurchase.findUnique({ where: { code: "PK-SEED01" } }))) {
    await db.packagePurchase.create({ data: { code: "PK-SEED01", playerId: userIds.get("amr@example.com")!, packageId: five.id, name: five.name, credits: 5, creditsUsed: 1, priceCents: five.priceCents, locationId: locationIds.get("new-cairo")!, expiresAt: new Date(Date.now() + 80 * 86_400_000), status: "ACTIVE", createdById: userIds.get("reception.newcairo@hitters.academy")!, payments: { create: { amountCents: five.priceCents, status: "PAID", method: "CARD", paidAt: new Date() } } } });
  }
  console.log("academy: done");

  console.log(`\nSeed complete. Sign in with any seeded email and the development password defined in prisma/seed.ts.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
