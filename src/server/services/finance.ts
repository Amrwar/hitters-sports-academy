/**
 * The finance dashboard.
 *
 * Everything is counted from the money records rather than from the things being sold, which is the
 * point of having invoices: revenue is what was invoiced, collected is what arrived, and outstanding is
 * the difference. Counting bookings and multiplying by a price would give a different, flattering number.
 *
 * Scoped like every other staff read: a location manager sees their clubs, an owner sees the academy.
 * An invoice with no club on it (an academy-wide membership) is counted at academy level only.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { accessibleLocationIds, requirePermission, type Actor } from "@/lib/auth/authorize";
import { amountDue } from "@/lib/payments/money";
import { fieldErrors, financeReportSchema } from "@/lib/validation/schemas";
import { validation } from "@/lib/errors";

export type Point = { label: string; value: number };

export type FinanceReport = {
  weeks: number;
  currency: string;
  scope: { locations: number; names: string[] };
  /** Money, all in minor units. */
  totals: {
    invoicedCents: number;
    collectedCents: number;
    refundedCents: number;
    outstandingCents: number;
    outstandingInvoices: number;
    discountCents: number;
    creditLiabilityCents: number;
    netCents: number;
  };
  previous: { invoicedCents: number; collectedCents: number; refundedCents: number };
  collectedByWeek: Point[];
  invoicedByWeek: Point[];
  byMethod: { method: string; label: string; count: number; amountCents: number }[];
  byKind: { kind: string; label: string; amountCents: number }[];
  byLocation: { id: string; name: string; invoicedCents: number; collectedCents: number; outstandingCents: number }[];
  /** The oldest unpaid invoices, which is what someone chasing money actually wants. */
  outstanding: { id: string; number: string; who: string; locationName: string | null; totalCents: number; dueCents: number; createdAt: Date; status: string }[];
  refunds: { id: string; number: string; who: string; amountCents: number; destination: string; reason: string | null; createdAt: Date }[];
  memberships: { active: number; pending: number; expiringSoon: number; recurringCents: number; byPlan: { key: string; name: string; active: number; priceCents: number }[] };
  packages: { sold: number; revenueCents: number; creditsOutstanding: number };
  providers: { key: string; label: string; online: boolean; configured: boolean }[];
};

const WEEK_MS = 7 * 86_400_000;

const startOfWeek = (d: Date): Date => {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  copy.setUTCDate(copy.getUTCDate() - ((copy.getUTCDay() + 6) % 7)); // weeks start Monday
  return copy;
};

const weekLabel = (d: Date): string => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

const METHOD_LABEL: Record<string, string> = { CASH: "Cash", CARD: "Card", WALLET: "Wallet", TRANSFER: "Transfer", CREDIT: "Account credit", NONE: "Waived" };
const KIND_LABEL: Record<string, string> = { COURT: "Court hire", LESSON: "Private lessons", PROGRAM: "Programs", PACKAGE: "Packages", MEMBERSHIP: "Memberships", FEE: "Fees", DISCOUNT: "Discounts", CREDIT: "Credit applied" };

export async function getFinanceReport(actor: Actor | null, input: unknown, opts: { now?: Date } = {}): Promise<FinanceReport> {
  const a = await requirePermission(actor, "finance.read");
  const parsed = financeReportSchema.safeParse(input ?? {});
  if (!parsed.success) throw validation("Check the filters.", fieldErrors(parsed.error));
  const { weeks } = parsed.data;
  const now = opts.now ?? new Date();
  const windowStart = startOfWeek(new Date(now.getTime() - (weeks - 1) * WEEK_MS));
  const previousStart = new Date(windowStart.getTime() - weeks * WEEK_MS);

  const scope = await accessibleLocationIds(a, "finance.read");
  const locations = await db.location.findMany({ where: scope === "all" ? {} : { id: { in: scope } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const ids = locations.map((l) => l.id);
  const requested = parsed.data.locationId && (scope === "all" || ids.includes(parsed.data.locationId)) ? parsed.data.locationId : null;

  // A null locationId is academy-wide (a membership sold centrally); it belongs to whoever can see the
  // whole academy, and to nobody looking at one club.
  const invoiceScope: Prisma.InvoiceWhereInput = requested ? { locationId: requested } : scope === "all" ? {} : { locationId: { in: ids } };
  const paymentScope: Prisma.PaymentWhereInput = requested ? { locationId: requested } : scope === "all" ? {} : { locationId: { in: ids } };

  const [invoiced, invoicedPrev, collected, collectedPrev, refunded, refundedPrev, outstandingRows, byMethodRows, byKindRows, weeklyRows, creditAgg, planRows, membershipCounts, expiringSoon, packageAgg, packageCredits, recentRefunds] =
    await Promise.all([
      db.invoice.aggregate({ where: { ...invoiceScope, status: { notIn: ["DRAFT", "VOID"] }, createdAt: { gte: windowStart, lte: now } }, _sum: { totalCents: true, discountCents: true }, _count: { _all: true } }),
      db.invoice.aggregate({ where: { ...invoiceScope, status: { notIn: ["DRAFT", "VOID"] }, createdAt: { gte: previousStart, lt: windowStart } }, _sum: { totalCents: true } }),
      db.payment.aggregate({ where: { ...paymentScope, status: { in: ["PAID", "PARTIALLY_REFUNDED"] }, paidAt: { gte: windowStart, lte: now } }, _sum: { amountCents: true }, _count: { _all: true } }),
      db.payment.aggregate({ where: { ...paymentScope, status: { in: ["PAID", "PARTIALLY_REFUNDED"] }, paidAt: { gte: previousStart, lt: windowStart } }, _sum: { amountCents: true } }),
      db.refund.aggregate({ where: { status: "SUCCEEDED", settledAt: { gte: windowStart, lte: now }, invoice: { is: invoiceScope } }, _sum: { amountCents: true } }),
      db.refund.aggregate({ where: { status: "SUCCEEDED", settledAt: { gte: previousStart, lt: windowStart }, invoice: { is: invoiceScope } }, _sum: { amountCents: true } }),
      db.invoice.findMany({
        where: { ...invoiceScope, status: { in: ["ISSUED", "PART_PAID"] }, voidedAt: null },
        select: { id: true, number: true, totalCents: true, paidCents: true, refundedCents: true, createdAt: true, status: true, guestName: true, player: { select: { name: true } }, location: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
        take: 500,
      }),
      db.payment.groupBy({ by: ["method"], where: { ...paymentScope, status: { in: ["PAID", "PARTIALLY_REFUNDED", "WAIVED"] }, paidAt: { gte: windowStart, lte: now } }, _sum: { amountCents: true }, _count: { _all: true } }),
      db.invoiceLine.groupBy({ by: ["kind"], where: { invoice: { is: { ...invoiceScope, status: { notIn: ["DRAFT", "VOID"] }, createdAt: { gte: windowStart, lte: now } } } }, _sum: { amountCents: true } }),
      // Both series in one pass: payments by the week they landed, invoices by the week they were raised.
      db.$queryRaw<{ week: Date; collected: bigint; invoiced: bigint }[]>`
        SELECT week, COALESCE(SUM(collected), 0)::bigint AS collected, COALESCE(SUM(invoiced), 0)::bigint AS invoiced FROM (
          SELECT date_trunc('week', p."paidAt") AS week, SUM(p."amountCents") AS collected, 0 AS invoiced
          FROM "Payment" p
          WHERE p."status" IN ('PAID', 'PARTIALLY_REFUNDED') AND p."paidAt" >= ${windowStart} AND p."paidAt" <= ${now}
            ${requested ? Prisma.sql`AND p."locationId" = ${requested}` : scope === "all" ? Prisma.empty : Prisma.sql`AND p."locationId" IN (${Prisma.join(ids.length ? ids : [""])})`}
          GROUP BY 1
          UNION ALL
          SELECT date_trunc('week', i."createdAt") AS week, 0 AS collected, SUM(i."totalCents") AS invoiced
          FROM "Invoice" i
          WHERE i."status" NOT IN ('DRAFT', 'VOID') AND i."createdAt" >= ${windowStart} AND i."createdAt" <= ${now}
            ${requested ? Prisma.sql`AND i."locationId" = ${requested}` : scope === "all" ? Prisma.empty : Prisma.sql`AND i."locationId" IN (${Prisma.join(ids.length ? ids : [""])})`}
          GROUP BY 1
        ) rows
        GROUP BY week
      `,
      db.creditAccount.aggregate({ _sum: { balanceCents: true } }),
      db.membershipPlan.findMany({ select: { key: true, name: true, priceCents: true, period: true, _count: { select: { memberships: { where: { status: "ACTIVE" } } } } }, orderBy: { sortOrder: "asc" } }),
      db.membership.groupBy({ by: ["status"], _count: { _all: true } }),
      db.membership.count({ where: { status: "ACTIVE", autoRenew: false, endsOn: { gte: now, lte: new Date(now.getTime() + 30 * 86_400_000) } } }),
      db.packagePurchase.aggregate({ where: { purchasedAt: { gte: windowStart, lte: now }, ...(requested ? { locationId: requested } : scope === "all" ? {} : { locationId: { in: ids } }) }, _sum: { priceCents: true }, _count: { _all: true } }),
      db.packagePurchase.findMany({ where: { status: "ACTIVE" }, select: { credits: true, creditsUsed: true } }),
      db.refund.findMany({
        where: { status: "SUCCEEDED", invoice: { is: invoiceScope } },
        select: { id: true, amountCents: true, destination: true, reason: true, createdAt: true, invoice: { select: { number: true, guestName: true, player: { select: { name: true } } } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

  const buckets = Array.from({ length: weeks }, (_, i) => new Date(windowStart.getTime() + i * WEEK_MS));
  const collectedByWeek: Point[] = buckets.map((b) => ({ label: weekLabel(b), value: 0 }));
  const invoicedByWeek: Point[] = buckets.map((b) => ({ label: weekLabel(b), value: 0 }));
  for (const row of weeklyRows) {
    const idx = Math.min(weeks - 1, Math.max(0, Math.floor((row.week.getTime() - windowStart.getTime()) / WEEK_MS)));
    collectedByWeek[idx].value += Number(row.collected);
    invoicedByWeek[idx].value += Number(row.invoiced);
  }

  const outstanding = outstandingRows.map((r) => ({ ...r, dueCents: amountDue(r) })).filter((r) => r.dueCents > 0);
  const outstandingCents = outstanding.reduce((n, r) => n + r.dueCents, 0);

  const collectedCents = collected._sum.amountCents ?? 0;
  const refundedCents = refunded._sum.amountCents ?? 0;
  const byLocationRows = await Promise.all(
    (requested ? locations.filter((l) => l.id === requested) : locations).map(async (l) => {
      const [inv, pay, due] = await Promise.all([
        db.invoice.aggregate({ where: { locationId: l.id, status: { notIn: ["DRAFT", "VOID"] }, createdAt: { gte: windowStart, lte: now } }, _sum: { totalCents: true } }),
        db.payment.aggregate({ where: { locationId: l.id, status: { in: ["PAID", "PARTIALLY_REFUNDED"] }, paidAt: { gte: windowStart, lte: now } }, _sum: { amountCents: true } }),
        db.invoice.findMany({ where: { locationId: l.id, status: { in: ["ISSUED", "PART_PAID"] }, voidedAt: null }, select: { totalCents: true, paidCents: true, refundedCents: true } }),
      ]);
      return { id: l.id, name: l.name, invoicedCents: inv._sum.totalCents ?? 0, collectedCents: pay._sum.amountCents ?? 0, outstandingCents: due.reduce((n, r) => n + amountDue(r), 0) };
    }),
  );

  const { listPaymentProviders, onlineProvider } = await import("@/lib/payments/provider");
  const live = onlineProvider();

  return {
    weeks,
    currency: "EGP",
    scope: { locations: requested ? 1 : locations.length, names: (requested ? locations.filter((l) => l.id === requested) : locations).map((l) => l.name) },
    totals: {
      invoicedCents: invoiced._sum.totalCents ?? 0,
      collectedCents,
      refundedCents,
      outstandingCents,
      outstandingInvoices: outstanding.length,
      discountCents: invoiced._sum.discountCents ?? 0,
      creditLiabilityCents: creditAgg._sum.balanceCents ?? 0,
      netCents: collectedCents - refundedCents,
    },
    previous: { invoicedCents: invoicedPrev._sum.totalCents ?? 0, collectedCents: collectedPrev._sum.amountCents ?? 0, refundedCents: refundedPrev._sum.amountCents ?? 0 },
    collectedByWeek,
    invoicedByWeek,
    byMethod: byMethodRows
      .map((r) => ({ method: r.method, label: METHOD_LABEL[r.method] ?? r.method, count: r._count._all, amountCents: r._sum.amountCents ?? 0 }))
      .sort((x, y) => y.amountCents - x.amountCents),
    byKind: byKindRows
      .map((r) => ({ kind: r.kind, label: KIND_LABEL[r.kind] ?? r.kind, amountCents: r._sum.amountCents ?? 0 }))
      .filter((r) => r.amountCents !== 0)
      .sort((x, y) => Math.abs(y.amountCents) - Math.abs(x.amountCents)),
    byLocation: byLocationRows,
    outstanding: outstanding.slice(0, 25).map((r) => ({ id: r.id, number: r.number, who: r.player?.name ?? r.guestName ?? "Guest", locationName: r.location?.name ?? null, totalCents: r.totalCents, dueCents: r.dueCents, createdAt: r.createdAt, status: r.status })),
    refunds: recentRefunds.map((r) => ({ id: r.id, number: r.invoice.number, who: r.invoice.player?.name ?? r.invoice.guestName ?? "Guest", amountCents: r.amountCents, destination: r.destination, reason: r.reason, createdAt: r.createdAt })),
    memberships: {
      active: membershipCounts.find((m) => m.status === "ACTIVE")?._count._all ?? 0,
      pending: membershipCounts.find((m) => m.status === "PENDING")?._count._all ?? 0,
      expiringSoon,
      // What the active terms are worth per month, so the academy can see its recurring base.
      recurringCents: planRows.reduce((n, p) => n + Math.round((p.priceCents / (p.period === "ANNUAL" ? 12 : p.period === "QUARTERLY" ? 3 : 1)) * p._count.memberships), 0),
      byPlan: planRows.map((p) => ({ key: p.key, name: p.name, active: p._count.memberships, priceCents: p.priceCents })),
    },
    packages: {
      sold: packageAgg._count._all,
      revenueCents: packageAgg._sum.priceCents ?? 0,
      creditsOutstanding: packageCredits.reduce((n, p) => n + Math.max(0, p.credits - p.creditsUsed), 0),
    },
    providers: listPaymentProviders().map((p) => ({ key: p.key, label: p.label, online: p.online, configured: p.key === live?.key || !p.online })),
  };
}

/**
 * Every money movement against one invoice, oldest first: what was charged, what arrived, what went back.
 * The audit log carries who did it; this is the statement a player or a manager reads.
 */
export async function invoiceLedger(actor: Actor | null, invoiceId: string): Promise<{ at: Date; kind: string; description: string; amountCents: number; by: string | null }[]> {
  const { getInvoice } = await import("./invoices");
  const invoice = await getInvoice(actor, invoiceId);
  const rows: { at: Date; kind: string; description: string; amountCents: number; by: string | null }[] = [
    { at: invoice.createdAt, kind: "Invoice", description: `${invoice.number} raised`, amountCents: invoice.totalCents, by: null },
    ...invoice.payments.map((p) => ({ at: p.paidAt ?? p.createdAt, kind: p.status === "WAIVED" ? "Waived" : "Payment", description: METHOD_LABEL[p.method] ?? p.method, amountCents: p.amountCents, by: p.receivedBy?.name ?? null })),
    ...invoice.refunds.filter((r) => r.status === "SUCCEEDED").map((r) => ({ at: r.settledAt ?? r.createdAt, kind: "Refund", description: r.reason ?? "Refunded", amountCents: -r.amountCents, by: null })),
  ];
  return rows.sort((a, b) => a.at.getTime() - b.at.getTime());
}
