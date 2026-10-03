/**
 * Development seed. Idempotent: safe to run repeatedly.
 * Creates the permission matrix, four locations with courts and availability, one account per role,
 * sample players with assessments, and a few notifications.
 *
 * All seeded accounts share the development password below. Change it before any shared deployment.
 */
import { PrismaClient, type CourtType, type PlayerLevel, type StaffRole } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { seedRolePermissions } from "../src/server/services/permissions-seed";
import { DEFAULT_LEVELS } from "../src/server/services/levels";

const db = new PrismaClient();
export const DEV_PASSWORD = "HittersDev!2026";

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
  console.log(`\nSeed complete. Sign in with any seeded email and the development password defined in prisma/seed.ts.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
