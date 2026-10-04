import type { Prisma } from "@prisma/client";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, forbidden, notFound, validation } from "@/lib/errors";
import { accessibleLocationIds, can, requireActor, requirePermission, type Actor } from "@/lib/auth/authorize";
import { fieldErrors, packagePurchaseSchema, packageSchema, recordPaymentSchema } from "@/lib/validation/schemas";
import { notify } from "./notifications";
import { plural } from "@/lib/notifications";
import { plainDate } from "@/lib/time";

/* ------------------------------------------------------------------ Catalogue */

export const packageSelect = {
  id: true,
  name: true,
  description: true,
  credits: true,
  priceCents: true,
  currency: true,
  validityDays: true,
  trainerId: true,
  locationId: true,
  active: true,
  trainer: { select: { id: true, user: { select: { name: true } } } },
  location: { select: { id: true, name: true } },
} satisfies Prisma.TrainingPackageSelect;
export type PackageView = Prisma.TrainingPackageGetPayload<{ select: typeof packageSelect }>;

export async function listPackages(actor: Actor | null, filter: { includeInactive?: boolean } = {}): Promise<PackageView[]> {
  const a = await requireActor(actor);
  const all = filter.includeInactive && (await can(a, "package.manage"));
  return db.trainingPackage.findMany({ where: all ? {} : { active: true }, select: packageSelect, orderBy: [{ credits: "asc" }, { priceCents: "asc" }] });
}

async function requirePackageScope(a: Actor, locationId: string | null | undefined) {
  if (locationId) return requirePermission(a, "package.manage", { locationId });
  if (!a.globalRole) throw forbidden("Only academy-wide roles manage packages that apply at every club.");
  return requirePermission(a, "package.manage");
}

export async function createPackage(actor: Actor | null, input: unknown): Promise<PackageView> {
  const a = await requireActor(actor);
  const parsed = packageSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  await requirePackageScope(a, parsed.data.locationId);
  if (parsed.data.trainerId && !(await db.trainerProfile.findUnique({ where: { id: parsed.data.trainerId } }))) throw notFound("Trainer");
  return db.$transaction(async (tx) => {
    const p = await tx.trainingPackage.create({ data: parsed.data, select: packageSelect });
    await audit({ actorId: a.id, action: "package.created", entityType: "TrainingPackage", entityId: p.id, locationId: parsed.data.locationId ?? null, metadata: { name: p.name, credits: p.credits, priceCents: p.priceCents } }, tx);
    return p;
  });
}

export async function updatePackage(actor: Actor | null, packageId: string, input: unknown): Promise<PackageView> {
  const a = await requireActor(actor);
  const existing = await db.trainingPackage.findUnique({ where: { id: packageId }, select: packageSelect });
  if (!existing) throw notFound("Package");
  const parsed = packageSchema.partial().safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  await requirePackageScope(a, existing.locationId);
  return db.$transaction(async (tx) => {
    const p = await tx.trainingPackage.update({ where: { id: packageId }, data: parsed.data, select: packageSelect });
    await audit({ actorId: a.id, action: "package.updated", entityType: "TrainingPackage", entityId: p.id, locationId: existing.locationId, metadata: { fields: Object.keys(parsed.data) } }, tx);
    return p;
  });
}

/* ------------------------------------------------------------------ Purchases */

export const purchaseSelect = {
  id: true,
  code: true,
  playerId: true,
  packageId: true,
  name: true,
  credits: true,
  creditsUsed: true,
  priceCents: true,
  currency: true,
  trainerId: true,
  locationId: true,
  purchasedAt: true,
  expiresAt: true,
  status: true,
  player: { select: { id: true, name: true, email: true } },
  redemptions: { select: { id: true, credits: true, redeemedAt: true, refundedAt: true, lesson: { select: { id: true, code: true, startsAt: true, status: true, trainer: { select: { user: { select: { name: true } } } }, location: { select: { name: true, timezone: true } } } } }, orderBy: { redeemedAt: "desc" as const } },
  payments: { select: { id: true, amountCents: true, currency: true, status: true, method: true, paidAt: true }, orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.PackagePurchaseSelect;
type PurchaseRow = Prisma.PackagePurchaseGetPayload<{ select: typeof purchaseSelect }>;
export type PurchaseView = PurchaseRow & { creditsLeft: number };

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = () => `PK-${Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("")}`;
const view = (r: PurchaseRow): PurchaseView => ({ ...r, creditsLeft: Math.max(0, r.credits - r.creditsUsed) });

/** ACTIVE purchases past their expiry become EXPIRED. Cheap enough to run on reads. */
export async function expirePurchases(now = new Date()): Promise<number> {
  const r = await db.packagePurchase.updateMany({ where: { status: "ACTIVE", expiresAt: { lt: now } }, data: { status: "EXPIRED" } });
  return r.count;
}

/**
 * A player buys a catalogue package for themself (pay at venue), or staff with package.manage sell a catalogue
 * or custom package to a member. No provider is charged: a PENDING payment is recorded, as for bookings.
 */
export async function purchasePackage(actor: Actor | null, input: unknown, opts: { now?: Date } = {}): Promise<PurchaseView> {
  const a = await requireActor(actor);
  const parsed = packagePurchaseSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const now = opts.now ?? new Date();
  const playerId = parsed.data.playerId ?? a.id;
  const pkg = parsed.data.packageId ? await db.trainingPackage.findUnique({ where: { id: parsed.data.packageId }, select: packageSelect }) : null;
  if (parsed.data.packageId && (!pkg || !pkg.active)) throw notFound("Package");
  const custom = !pkg;
  if (playerId !== a.id || custom) {
    await requirePackageScope(a, pkg?.locationId ?? null).catch(async () => {
      // A location role may sell custom packages at its own clubs; attach the club through the player's home location.
      const home = await db.playerProfile.findUnique({ where: { userId: playerId }, select: { homeLocationId: true } });
      if (!home?.homeLocationId) throw forbidden();
      return requirePermission(a, "package.manage", { locationId: home.homeLocationId });
    });
  } else await requirePermission(a, "package.purchase.own");
  if (custom && (!parsed.data.name || !parsed.data.credits || parsed.data.priceCents === undefined)) throw validation("A custom package needs a name, credits and a price.", { credits: "Required" });
  const player = await db.user.findUnique({ where: { id: playerId }, select: { id: true, name: true, status: true, playerProfile: { select: { homeLocationId: true } } } });
  if (!player || player.status !== "ACTIVE") throw notFound("Player");
  const credits = pkg?.credits ?? parsed.data.credits!;
  const priceCents = pkg?.priceCents ?? parsed.data.priceCents!;
  const validityDays = pkg?.validityDays ?? parsed.data.validityDays ?? 90;
  const name = pkg?.name ?? parsed.data.name!;
  const locationId = pkg?.locationId ?? player.playerProfile?.homeLocationId ?? null;
  const purchase = await db.$transaction(async (tx) => {
    let c = code();
    for (let i = 0; i < 5 && (await tx.packagePurchase.findUnique({ where: { code: c }, select: { id: true } })); i++) c = code();
    const p = await tx.packagePurchase.create({
      data: { code: c, playerId, packageId: pkg?.id ?? null, name, credits, priceCents, currency: pkg?.currency ?? "EGP", trainerId: pkg?.trainerId ?? null, locationId, purchasedAt: now, expiresAt: new Date(now.getTime() + validityDays * 86_400_000), status: "ACTIVE", createdById: a.id, payments: { create: { amountCents: priceCents, currency: pkg?.currency ?? "EGP", status: "PENDING", method: "NONE" } } },
      select: purchaseSelect,
    });
    await audit({ actorId: a.id, action: "package.purchased", entityType: "PackagePurchase", entityId: p.id, locationId, metadata: { code: c, playerId, credits, priceCents, custom } }, tx);
    return view(p);
  });
  await notify(playerId, { type: "package.purchased", url: "/app/packages", data: { package: name, credits, creditsPlural: plural(credits), expires: plainDate(purchase.expiresAt), purchaseId: purchase.id, code: purchase.code } });
  return purchase;
}

export async function listMyPurchases(actor: Actor | null, now = new Date()): Promise<PurchaseView[]> {
  const a = await requirePermission(actor, "package.purchase.own");
  await expirePurchases(now);
  const rows = await db.packagePurchase.findMany({ where: { playerId: a.id }, select: purchaseSelect, orderBy: [{ status: "asc" }, { purchasedAt: "desc" }] });
  return rows.map(view);
}

/** Active purchases a player can spend on a lesson with this trainer at this club. */
export async function usablePurchases(actor: Actor | null, playerId: string, trainerId: string, locationId: string, now = new Date()): Promise<PurchaseView[]> {
  const a = await requireActor(actor);
  if (a.id !== playerId) await requirePermission(a, "lesson.manage", { locationId });
  await expirePurchases(now);
  const rows = await db.packagePurchase.findMany({ where: { playerId, status: "ACTIVE", expiresAt: { gt: now }, OR: [{ trainerId: null }, { trainerId }], AND: { OR: [{ locationId: null }, { locationId }] } }, select: purchaseSelect, orderBy: { expiresAt: "asc" } });
  return rows.map(view).filter((p) => p.creditsLeft > 0);
}

/** Staff: purchases at the clubs they manage packages for. */
export async function listPurchasesInScope(actor: Actor | null, now = new Date()): Promise<PurchaseView[]> {
  const a = await requireActor(actor);
  const ids = await accessibleLocationIds(a, "package.manage");
  if (ids !== "all" && ids.length === 0) throw forbidden();
  await expirePurchases(now);
  const rows = await db.packagePurchase.findMany({ where: ids === "all" ? {} : { OR: [{ locationId: { in: ids } }, { locationId: null, player: { playerProfile: { homeLocationId: { in: ids } } } }] }, select: purchaseSelect, orderBy: { purchasedAt: "desc" }, take: 200 });
  return rows.map(view);
}

export async function cancelPurchase(actor: Actor | null, purchaseId: string, opts: { now?: Date } = {}): Promise<PurchaseView> {
  const a = await requireActor(actor);
  const p = await db.packagePurchase.findUnique({ where: { id: purchaseId }, select: purchaseSelect });
  if (!p) throw notFound("Package");
  await requirePackageScope(a, p.locationId);
  if (p.status === "CANCELLED") throw new AppError("INVALID_TRANSITION", "Already cancelled.");
  if (p.creditsUsed > 0) throw validation("Credits have been used on this package; it cannot be cancelled.");
  const now = opts.now ?? new Date();
  return db.$transaction(async (tx) => {
    await tx.packagePurchase.update({ where: { id: p.id }, data: { status: "CANCELLED" } });
    await tx.payment.updateMany({ where: { purchaseId: p.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    await tx.payment.updateMany({ where: { purchaseId: p.id, status: "PAID" }, data: { status: "REFUNDED", refundedAt: now } });
    await audit({ actorId: a.id, action: "package.cancelled", entityType: "PackagePurchase", entityId: p.id, locationId: p.locationId }, tx);
    return view(await tx.packagePurchase.findUniqueOrThrow({ where: { id: p.id }, select: purchaseSelect }));
  });
}

/* ------------------------------------------------------------------ Venue payments for academy items */

export type PaymentTarget = { lessonId: string } | { enrollmentId: string } | { purchaseId: string };

/** Staff with payment.manage at the item's club record cash, card or wallet payment taken at the venue. */
export async function recordAcademyPayment(actor: Actor | null, target: PaymentTarget, input: unknown, opts: { now?: Date } = {}): Promise<{ ok: true }> {
  const a = await requireActor(actor);
  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const now = opts.now ?? new Date();
  let locationId: string | null = null;
  let amountCents = 0;
  let where: Prisma.PaymentWhereInput;
  let entity: { type: string; id: string };
  if ("lessonId" in target) {
    const l = await db.lesson.findUnique({ where: { id: target.lessonId }, select: { id: true, locationId: true, priceCents: true, status: true } });
    if (!l) throw notFound("Lesson");
    if (l.status === "CANCELLED") throw validation("Cannot take payment for a cancelled lesson.");
    locationId = l.locationId;
    amountCents = l.priceCents;
    where = { lessonId: l.id };
    entity = { type: "Lesson", id: l.id };
  } else if ("enrollmentId" in target) {
    const e = await db.programEnrollment.findUnique({ where: { id: target.enrollmentId }, select: { id: true, status: true, program: { select: { locationId: true, priceCents: true } } } });
    if (!e) throw notFound("Enrollment");
    if (e.status === "CANCELLED" || e.status === "WAITLISTED") throw validation("Only enrolled players pay.");
    locationId = e.program.locationId;
    amountCents = e.program.priceCents;
    where = { enrollmentId: e.id };
    entity = { type: "ProgramEnrollment", id: e.id };
  } else {
    const p = await db.packagePurchase.findUnique({ where: { id: target.purchaseId }, select: { id: true, locationId: true, priceCents: true, status: true } });
    if (!p) throw notFound("Package");
    if (p.status === "CANCELLED") throw validation("Cannot take payment for a cancelled package.");
    locationId = p.locationId;
    amountCents = p.priceCents;
    where = { purchaseId: p.id };
    entity = { type: "PackagePurchase", id: p.id };
  }
  if (locationId) await requirePermission(a, "payment.manage", { locationId });
  else await requirePermission(a, "payment.manage");
  await db.$transaction(async (tx) => {
    const pending = await tx.payment.findFirst({ where: { ...where, status: "PENDING" } });
    if (pending) await tx.payment.update({ where: { id: pending.id }, data: { status: parsed.data.status, method: parsed.data.method, paidAt: now } });
    else await tx.payment.create({ data: { ...("lessonId" in target ? { lessonId: target.lessonId } : "enrollmentId" in target ? { enrollmentId: target.enrollmentId } : { purchaseId: target.purchaseId }), amountCents, status: parsed.data.status, method: parsed.data.method, paidAt: now } });
    await audit({ actorId: a.id, action: "payment.recorded", entityType: entity.type, entityId: entity.id, locationId, metadata: parsed.data }, tx);
  });
  return { ok: true };
}
