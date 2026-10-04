/**
 * The marketing site's data.
 *
 * Everything here is read without an actor, so the shape is deliberately narrow: only fields a club would
 * print on a poster. In particular no email, phone or player identity ever leaves this module, and the
 * selects are written out in full rather than reusing the app's internal ones, which do carry contact
 * details. Keep it that way — a reused select is how a private field reaches a public page.
 *
 * The figures are live, so the landing page cannot drift out of date with the academy it is selling.
 */
import { db } from "@/lib/db";

export type SiteCoach = {
  id: string;
  name: string;
  title: string;
  photoUrl: string | null;
  specialties: string[];
  yearsExperience: number | null;
  hourlyRateCents: number;
  currency: string;
  clubs: string[];
  lessonsTaught: number;
};

export type SiteProgram = {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string | null;
  levels: string[];
  sessionsCount: number;
  priceCents: number;
  currency: string;
  startsOn: Date;
  spotsLeft: number;
  capacity: number;
  locationName: string;
  coachName: string;
};

export type SiteContent = {
  coaches: SiteCoach[];
  programs: SiteProgram[];
};

export async function getSiteContent(): Promise<SiteContent> {
  const [coachRows, programRows] = await Promise.all([
    db.trainerProfile.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        title: true,
        photoUrl: true,
        specialties: true,
        yearsExperience: true,
        hourlyRateCents: true,
        currency: true,
        user: { select: { name: true } },
        locations: { select: { location: { select: { name: true } } } },
        _count: { select: { lessons: { where: { status: "COMPLETED" } } } },
      },
      orderBy: [{ yearsExperience: "desc" }, { createdAt: "asc" }],
      take: 8,
    }),
    db.program.findMany({
      where: { status: "OPEN", endsOn: { gte: new Date() } },
      select: {
        id: true,
        code: true,
        name: true,
        category: true,
        description: true,
        levels: true,
        capacity: true,
        priceCents: true,
        currency: true,
        startsOn: true,
        location: { select: { name: true } },
        trainer: { select: { user: { select: { name: true } } } },
        _count: { select: { sessions: true, enrollments: { where: { status: "ENROLLED" } } } },
      },
      orderBy: { startsOn: "asc" },
      take: 6,
    }),
  ]);

  return {
    coaches: coachRows.map((c) => ({
      id: c.id,
      name: c.user.name,
      title: c.title,
      photoUrl: c.photoUrl,
      specialties: c.specialties,
      yearsExperience: c.yearsExperience,
      hourlyRateCents: c.hourlyRateCents,
      currency: c.currency,
      clubs: c.locations.map((l) => l.location.name.replace("HITTERS ", "")),
      lessonsTaught: c._count.lessons,
    })),
    programs: programRows.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      category: p.category,
      description: p.description,
      levels: p.levels,
      sessionsCount: p._count.sessions,
      priceCents: p.priceCents,
      currency: p.currency,
      startsOn: p.startsOn,
      spotsLeft: Math.max(0, p.capacity - p._count.enrollments),
      capacity: p.capacity,
      locationName: p.location.name.replace("HITTERS ", ""),
      coachName: p.trainer.user.name,
    })),
  };
}
