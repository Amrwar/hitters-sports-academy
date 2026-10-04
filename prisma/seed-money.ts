/**
 * The money side of the demo database: a payment policy, membership plans with members on them, discount
 * codes, and invoices raised against the trading history that already exists.
 *
 * The history seed writes bookings and payments directly, which is what makes it fast, but it leaves the
 * finance screens with nothing to report on: an invoice is raised by the booking service, and the history
 * never calls it. This backfills one invoice per generated booking, with the same status the booking's
 * payment already has, so "collected", "outstanding" and "refunded" are the same numbers a club would see
 * if every one of those bookings had been taken at the desk.
 *
 * Idempotent on every pass: invoices are only raised for bookings that do not already have one, and the
 * plans and coupons are upserted by their natural key.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

const PLANS = [
  {
    key: "CLUB",
    name: "Club",
    description: "Member rates at every HITTERS club, and the booking window opens two days earlier.",
    priceCents: 60000,
    period: "MONTHLY" as const,
    benefits: ["Member rates at every club", "Free level assessment"],
    periodCreditCents: 0,
    freeAssessments: 1,
    priorityBookingDays: 2,
    sortOrder: 0,
  },
  {
    key: "PRO",
    name: "Pro",
    description: "Everything in Club, plus EGP 200 of academy credit a month and a week of priority booking.",
    priceCents: 120000,
    period: "MONTHLY" as const,
    benefits: ["Member rates at every club", "Free level assessment", "Guest passes"],
    periodCreditCents: 20000,
    freeAssessments: 2,
    priorityBookingDays: 7,
    sortOrder: 1,
  },
  {
    key: "ELITE",
    name: "Elite",
    description: "A year up front: the deepest member rate, EGP 500 of credit a month and the longest booking window.",
    priceCents: 1200000,
    period: "ANNUAL" as const,
    benefits: ["The deepest member rate", "Priority on every waitlist", "Two guest passes a month"],
    periodCreditCents: 50000,
    freeAssessments: 4,
    priorityBookingDays: 14,
    sortOrder: 2,
  },
];

const COUPONS = [
  { code: "WELCOME20", name: "New member, 20% off", kind: "PERCENT" as const, value: 20, maxDiscountCents: 20000, maxPerPlayer: 1, appliesTo: [] },
  { code: "ACADEMY10", name: "10% off any program", kind: "PERCENT" as const, value: 10, appliesTo: ["PROGRAM" as const, "LESSON" as const], maxPerPlayer: 2 },
  { code: "OFFPEAK50", name: "EGP 50 off a daytime court", kind: "FIXED" as const, value: 5000, minSpendCents: 30000, appliesTo: ["COURT" as const], maxPerPlayer: 4 },
];

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const addMonths = (from: Date, months: number): Date => new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, from.getUTCDate()));

export async function seedMoney(db: PrismaClient): Promise<{ plans: number; members: number; coupons: number; invoices: number }> {
  const random = rng(20261006);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  // A policy with teeth, so the cancellation and refund paths have something to do in a demo.
  await db.paymentPolicy.upsert({
    where: { id: (await db.paymentPolicy.findFirst({ where: { locationId: null }, select: { id: true } }))?.id ?? "seed-default-policy" },
    create: { id: "seed-default-policy", locationId: null, timing: "AT_CLUB", lateCancellationPercent: 50, noShowPercent: 100, refundCutoffHours: 2, refundDestination: "ORIGINAL", defaultGameCostMode: "SPLIT_EVENLY", allowCredit: true },
    update: { lateCancellationPercent: 50, noShowPercent: 100, refundCutoffHours: 2 },
  });

  for (const plan of PLANS) {
    await db.membershipPlan.upsert({ where: { key: plan.key }, create: plan, update: { ...plan } });
  }
  for (const coupon of COUPONS) {
    await db.coupon.upsert({ where: { code: coupon.code }, create: coupon, update: { name: coupon.name, value: coupon.value, active: true } });
  }

  // Roughly one member in six holds a membership, weighted to the cheaper tiers, which is what a club
  // that has been selling them for a few months actually looks like.
  const plans = await db.membershipPlan.findMany({ orderBy: { sortOrder: "asc" } });
  const players = await db.user.findMany({ where: { status: "ACTIVE", globalRole: null, playerProfile: { isNot: null } }, select: { id: true }, orderBy: { createdAt: "asc" } });
  const existingMembers = new Set((await db.membership.findMany({ select: { playerId: true } })).map((m) => m.playerId));

  let members = 0;
  for (const player of players) {
    if (existingMembers.has(player.id)) continue;
    if (random() > 0.17) continue;
    const r = random();
    const plan = plans[r < 0.5 ? 0 : r < 0.88 ? 1 : 2]!;
    const monthsIn = Math.floor(random() * 4);
    const startsOn = addMonths(today, -monthsIn);
    const endsOn = new Date(addMonths(startsOn, plan.period === "ANNUAL" ? 12 : plan.period === "QUARTERLY" ? 3 : 1).getTime() - 86_400_000);
    if (endsOn < today) continue;

    const membership = await db.membership.create({
      data: {
        code: `MB-SEED${String(++members).padStart(3, "0")}`,
        playerId: player.id,
        planId: plan.id,
        status: "ACTIVE",
        startsOn,
        endsOn,
        autoRenew: random() < 0.6,
        createdAt: startsOn,
      },
      select: { id: true },
    });

    const invoice = await db.invoice.create({
      data: {
        number: `HT-MB-${String(members).padStart(6, "0")}`,
        playerId: player.id,
        locationId: plan.locationId,
        currency: plan.currency,
        membershipId: membership.id,
        subtotalCents: plan.priceCents,
        totalCents: plan.priceCents,
        paidCents: plan.priceCents,
        status: "PAID",
        issuedAt: startsOn,
        paidAt: startsOn,
        createdAt: startsOn,
        lines: { create: [{ kind: "MEMBERSHIP", description: `${plan.name} membership`, quantity: 1, unitCents: plan.priceCents, amountCents: plan.priceCents, sortOrder: 0 }] },
      },
      select: { id: true },
    });
    await db.payment.create({
      data: {
        invoiceId: invoice.id,
        membershipId: membership.id,
        payerId: player.id,
        amountCents: plan.priceCents,
        currency: plan.currency,
        status: "PAID",
        method: random() < 0.5 ? "CARD" : "CASH",
        provider: "manual",
        idempotencyKey: `seed-membership:${membership.id}`,
        paidAt: startsOn,
        createdAt: startsOn,
      },
    });
    if (plan.periodCreditCents > 0) {
      const account = await db.creditAccount.upsert({ where: { playerId: player.id }, create: { playerId: player.id, balanceCents: plan.periodCreditCents }, update: { balanceCents: { increment: plan.periodCreditCents } } });
      await db.creditEntry.create({
        data: { accountId: account.id, kind: "TOPUP", amountCents: plan.periodCreditCents, balanceAfterCents: account.balanceCents, reason: `${plan.name} membership credit`, createdAt: startsOn },
      });
    }
  }

  const invoices = await backfillBookingInvoices(db, random);
  return { plans: plans.length, members, coupons: COUPONS.length, invoices };
}

/**
 * Raises an invoice for each generated booking that has none.
 *
 * The status mirrors the booking's own payment, so the finance screens show the same mix of paid,
 * outstanding and refunded that the booking screens already do. Done in chunks because a demo database
 * holds tens of thousands of these.
 */
async function backfillBookingInvoices(db: PrismaClient, random: () => number): Promise<number> {
  const bookings = await db.booking.findMany({
    where: { invoices: { none: {} }, confirmationCode: { startsWith: "HX-" } },
    select: {
      id: true,
      playerId: true,
      locationId: true,
      priceCents: true,
      startsAt: true,
      durationMinutes: true,
      status: true,
      createdAt: true,
      court: { select: { name: true } },
      location: { select: { name: true } },
      payments: { select: { id: true, status: true, method: true, amountCents: true, paidAt: true } },
    },
    take: 40_000,
  });
  if (bookings.length === 0) return 0;

  let n = 0;
  const lines: Prisma.InvoiceLineCreateManyInput[] = [];
  const invoiceRows: Prisma.InvoiceCreateManyInput[] = [];
  const paymentUpdates: { id: string; invoiceId: string }[] = [];

  for (const b of bookings) {
    const payment = b.payments[0] ?? null;
    const paid = payment?.status === "PAID";
    const cancelled = b.status === "CANCELLED";
    const id = `inv_seed_${b.id}`;
    n++;
    invoiceRows.push({
      id,
      number: `HT-BK-${String(n).padStart(6, "0")}`,
      playerId: b.playerId,
      locationId: b.locationId,
      bookingId: b.id,
      subtotalCents: b.priceCents,
      totalCents: b.priceCents,
      paidCents: paid ? b.priceCents : 0,
      status: cancelled ? "VOID" : paid ? "PAID" : "ISSUED",
      issuedAt: b.createdAt,
      paidAt: paid ? (payment?.paidAt ?? b.startsAt) : null,
      voidedAt: cancelled ? b.startsAt : null,
      voidReason: cancelled ? "Booking cancelled" : null,
      createdAt: b.createdAt,
    });
    lines.push({
      invoiceId: id,
      kind: "COURT",
      description: `${b.court.name} · ${b.location.name} · ${b.durationMinutes} min`,
      quantity: 1,
      unitCents: b.priceCents,
      amountCents: b.priceCents,
      sortOrder: 0,
    });
    if (payment) paymentUpdates.push({ id: payment.id, invoiceId: id });
  }

  for (let i = 0; i < invoiceRows.length; i += 500) await db.invoice.createMany({ data: invoiceRows.slice(i, i + 500), skipDuplicates: true });
  for (let i = 0; i < lines.length; i += 500) await db.invoiceLine.createMany({ data: lines.slice(i, i + 500), skipDuplicates: true });
  // Point the existing payments at their invoice so the finance screen and the booking screen agree.
  for (const chunk of chunked(paymentUpdates, 200)) {
    await Promise.all(chunk.map((u) => db.payment.update({ where: { id: u.id }, data: { invoiceId: u.invoiceId } })));
  }

  // A handful of refunds, so the refund panel reports on something real.
  const refundable = invoiceRows.filter((r) => r.status === "PAID").filter(() => random() < 0.01);
  for (const r of refundable.slice(0, 40)) {
    const amountCents = Math.round((r.totalCents as number) * (random() < 0.5 ? 1 : 0.5));
    await db.refund.create({
      data: {
        invoiceId: r.id as string,
        amountCents,
        status: "SUCCEEDED",
        destination: random() < 0.3 ? "CREDIT" : "ORIGINAL",
        reason: random() < 0.5 ? "Court unplayable" : "Cancelled by the club",
        idempotencyKey: `seed-refund:${r.id}`,
        settledAt: r.paidAt as Date,
        createdAt: r.paidAt as Date,
      },
    });
    await db.invoice.update({ where: { id: r.id as string }, data: { refundedCents: amountCents, status: amountCents >= (r.totalCents as number) ? "REFUNDED" : "PART_PAID" } });
  }
  return n;
}

function* chunked<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}
