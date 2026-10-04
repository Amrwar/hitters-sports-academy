/**
 * Completed intakes behind today, and the open ones filled up.
 *
 * The analytics academy panel reports on programs, places taken and attendance. With only the three
 * upcoming demo intakes it reads "4 of 22 places taken", which describes an academy nobody has joined.
 * This adds finished intakes across the last thirty weeks, each with a roster and a session-by-session
 * attendance register, and brings the open ones close to capacity without filling them, so a visitor can
 * still see "2 places left" and enrol.
 *
 * Idempotent: the intakes it creates carry a PX- code and it does nothing if any exist.
 */
import type { PrismaClient, PlayerLevel, Prisma } from "@prisma/client";

const CODE_PREFIX = "PX-";

type Template = {
  name: string;
  category: Prisma.ProgramCreateInput["category"];
  description: string;
  levels: PlayerLevel[];
  sessions: number;
  capacity: number;
  priceCents: number;
  durationMinutes: number;
  minAge?: number;
  maxAge?: number;
};

const TEMPLATES: Template[] = [
  { name: "Foundations", category: "BEGINNER", description: "Six weeks from first contact to a rally that keeps going: grip, ready position, the glass and the basic serve.", levels: ["D"], sessions: 6, capacity: 10, priceCents: 300000, durationMinutes: 60 },
  { name: "Intermediate Tuesdays", category: "INTERMEDIATE", description: "Structured doubles work for Level B: positioning, lobs, bandeja and match play.", levels: ["B"], sessions: 6, capacity: 8, priceCents: 360000, durationMinutes: 90 },
  { name: "Level C Progression", category: "INTERMEDIATE", description: "Eight weeks closing the gap to Level B: consistency under pressure, court coverage and shot selection.", levels: ["C"], sessions: 8, capacity: 8, priceCents: 420000, durationMinutes: 90 },
  { name: "Junior Academy · Saturdays", category: "JUNIOR", description: "Ages 8 to 14. Fun, safe, progressive coaching in small groups, finishing with a tournament.", levels: [], sessions: 10, capacity: 10, priceCents: 400000, durationMinutes: 60, minAge: 8, maxAge: 14 },
  { name: "Competitive Edge", category: "COMPETITIVE", description: "Tournament preparation for Level A: tactics, pressure drills and match analysis.", levels: ["A"], sessions: 4, capacity: 4, priceCents: 320000, durationMinutes: 120 },
  { name: "Women's Group", category: "GROUP_COACHING", description: "A standing weekly group at every level, built around match play rather than drills.", levels: [], sessions: 6, capacity: 8, priceCents: 330000, durationMinutes: 90 },
];

const TOPICS = ["Grip and ready position", "The glass, front and back", "Serve and return", "Bandeja", "Vibora and smash", "Lobs and recovery", "Net pressure", "Court positioning", "Match play", "Point construction"];

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Most people turn up, a few are late, some miss a week. */
const attendanceStatus = (random: () => number): Prisma.ProgramAttendanceCreateManyInput["status"] => {
  const r = random();
  return r < 0.78 ? "PRESENT" : r < 0.88 ? "LATE" : r < 0.96 ? "ABSENT" : "EXCUSED";
};

export async function seedAcademyHistory(db: PrismaClient): Promise<{ programs: number; enrollments: number; skipped: boolean }> {
  if (await db.program.count({ where: { code: { startsWith: CODE_PREFIX } } })) return { programs: 0, enrollments: 0, skipped: true };

  const [trainers, locations, staff] = await Promise.all([
    db.trainerProfile.findMany({ where: { status: "ACTIVE" }, select: { id: true, userId: true, locations: { select: { locationId: true } } } }),
    db.location.findMany({ where: { status: "ACTIVE" }, select: { id: true } }),
    db.user.findFirst({ where: { memberships: { some: { role: "LOCATION_MANAGER", status: "ACTIVE" } } }, select: { id: true } }),
  ]);
  if (trainers.length === 0 || locations.length === 0) return { programs: 0, enrollments: 0, skipped: true };

  const players = await db.playerProfile.findMany({ select: { userId: true, level: true } });
  if (players.length < 8) return { programs: 0, enrollments: 0, skipped: true };
  const byLevel = (levels: PlayerLevel[]) => (levels.length === 0 ? players : players.filter((p) => p.level && levels.includes(p.level)));

  const random = rng(20261005);
  const now = new Date();
  let programs = 0;
  let enrollments = 0;

  // Four intakes per template across the last thirty weeks, each finishing before today.
  for (let round = 0; round < 4; round++) {
    for (const [i, t] of TEMPLATES.entries()) {
      const weeksAgo = 4 + round * 6 + (i % 3);
      const endsOn = new Date(now.getTime() - weeksAgo * 7 * 86_400_000);
      const startsOn = new Date(endsOn.getTime() - t.sessions * 7 * 86_400_000);
      const trainer = trainers[Math.floor(random() * trainers.length)]!;
      const locationId = trainer.locations[Math.floor(random() * Math.max(1, trainer.locations.length))]?.locationId ?? locations[Math.floor(random() * locations.length)]!.id;
      const dayOfWeek = 1 + Math.floor(random() * 6);
      const startMinutes = (17 + Math.floor(random() * 4)) * 60;
      const code = `${CODE_PREFIX}${(programs + 1).toString().padStart(3, "0")}`;

      const sessionRows = Array.from({ length: t.sessions }, (_, k) => {
        const day = new Date(startsOn.getTime() + k * 7 * 86_400_000);
        day.setUTCHours(0, 0, 0, 0);
        // Africa/Cairo is UTC+2 for the seeded clubs; the stored instant is local time minus two hours.
        const startsAt = new Date(day.getTime() + (startMinutes - 120) * 60_000);
        return { index: k + 1, startsAt, endsAt: new Date(startsAt.getTime() + t.durationMinutes * 60_000), status: "COMPLETED" as const, topic: TOPICS[(k + i) % TOPICS.length] };
      });

      const program = await db.program.create({
        data: {
          code,
          name: t.name,
          category: t.category,
          description: t.description,
          levels: t.levels,
          minAge: t.minAge,
          maxAge: t.maxAge,
          trainerId: trainer.id,
          locationId,
          startsOn,
          endsOn,
          schedule: [{ dayOfWeek, startMinutes, durationMinutes: t.durationMinutes }],
          sessionsCount: t.sessions,
          capacity: t.capacity,
          priceCents: t.priceCents,
          status: "COMPLETED",
          createdById: staff?.id ?? null,
          createdAt: new Date(startsOn.getTime() - 21 * 86_400_000),
          sessions: { create: sessionRows },
        },
        select: { id: true, sessions: { select: { id: true } } },
      });
      programs++;

      // An intake that ran usually filled, but not always; nobody enrols above capacity.
      const pool = byLevel(t.levels);
      const target = Math.min(t.capacity, Math.max(3, Math.round(t.capacity * (0.7 + random() * 0.3))));
      const chosen = new Set<string>();
      for (let guard = 0; chosen.size < target && guard < target * 20; guard++) chosen.add(pool[Math.floor(random() * pool.length)]!.userId);

      for (const playerId of chosen) {
        const enrollment = await db.programEnrollment.create({
          data: {
            programId: program.id,
            playerId,
            status: "COMPLETED",
            enrolledAt: new Date(startsOn.getTime() - 10 * 86_400_000),
            createdById: playerId,
            createdAt: new Date(startsOn.getTime() - 10 * 86_400_000),
            payments: { create: { amountCents: t.priceCents, status: "PAID", method: random() < 0.5 ? "CASH" : "CARD", paidAt: startsOn } },
          },
          select: { id: true },
        });
        enrollments++;
        await db.programAttendance.createMany({
          data: program.sessions.map((sess) => ({ sessionId: sess.id, enrollmentId: enrollment.id, status: attendanceStatus(random), markedById: trainer.userId, markedAt: new Date(startsOn.getTime() + 86_400_000) })),
          skipDuplicates: true,
        });
      }
    }
  }

  // Bring the open intakes close to capacity. Two places are deliberately left so the enrolment flow, the
  // "places left" badge and the waitlist all have something to show.
  const open = await db.program.findMany({
    where: { status: "OPEN" },
    select: { id: true, capacity: true, levels: true, allowWaitlist: true, startsOn: true, priceCents: true, enrollments: { select: { playerId: true } } },
  });
  for (const p of open) {
    // A player can only hold one enrolment per intake, so anyone the base seed already placed is excluded.
    const taken = new Set(p.enrollments.map((e) => e.playerId));
    const pool = byLevel(p.levels).filter((x) => !taken.has(x.userId));
    const want = Math.max(0, p.capacity - taken.size - 2);
    const picked = new Set<string>();
    for (let guard = 0; picked.size < want && guard < want * 20 && pool.length; guard++) picked.add(pool[Math.floor(random() * pool.length)]!.userId);
    for (const playerId of picked) {
      await db.programEnrollment.create({
        data: {
          programId: p.id,
          playerId,
          status: "ENROLLED",
          enrolledAt: new Date(now.getTime() - Math.floor(random() * 20) * 86_400_000),
          createdById: playerId,
          payments: { create: { amountCents: p.priceCents, status: random() < 0.6 ? "PAID" : "PENDING", method: random() < 0.6 ? "CARD" : "NONE", ...(random() < 0.6 ? { paidAt: now } : {}) } },
        },
      });
      enrollments++;
    }
    // One waitlisted player per intake that takes a waitlist, so the position badge has a subject.
    const free = pool.find((x) => !picked.has(x.userId));
    if (p.allowWaitlist && free) {
      await db.programEnrollment.create({ data: { programId: p.id, playerId: free.userId, status: "WAITLISTED", position: 1, createdById: free.userId } });
      enrollments++;
    }
  }

  return { programs, enrollments, skipped: false };
}
