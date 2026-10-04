/**
 * Group messaging for the people already playing or training together: one thread per game and one per
 * training program, created the first time someone opens it.
 *
 * Two rules shape everything here. Only the lineup can read or post, so a thread is never a public wall.
 * And a thread never exposes a contact detail: members see a name, a photo and a level, which is what the
 * brief asks for when it says players should be able to reach each other without sharing phone numbers.
 */
import type { MessageThreadKind, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { forbidden, notFound, validation } from "@/lib/errors";
import { accessibleLocationIds, can, requireActor, requirePermission, type Actor } from "@/lib/auth/authorize";
import { fieldErrors, messageReportSchema, messageSchema, reportDecisionSchema } from "@/lib/validation/schemas";
import { notify, notifyMany } from "./notifications";

/* ------------------------------------------------------------------ Shapes */

/** Everything a member may see about another member. No email, no phone, by construction. */
const memberSelect = { id: true, name: true, playerProfile: { select: { level: true, photoUrl: true } } } satisfies Prisma.UserSelect;

export const messageSelect = {
  id: true,
  body: true,
  createdAt: true,
  deletedAt: true,
  senderId: true,
  sender: { select: memberSelect },
  reports: { select: { id: true, reporterId: true, status: true } },
} satisfies Prisma.MessageSelect;
export type MessageView = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;

export type ThreadMember = { id: string; name: string; level: string | null; photoUrl: string | null; role: "ORGANIZER" | "COACH" | "PLAYER" };

export type ThreadContext = {
  kind: MessageThreadKind;
  /** The game code or program name, used as the thread's title and in notifications. */
  label: string;
  locationId: string;
  href: string;
  gameId?: string;
  programId?: string;
  members: ThreadMember[];
  /** True once the lineup is set or the program is running: messaging opens then. */
  open: boolean;
  closedReason?: string;
};

export type ThreadView = {
  id: string | null;
  kind: MessageThreadKind;
  label: string;
  href: string;
  locked: boolean;
  members: ThreadMember[];
  messages: MessageView[];
  canPost: boolean;
  /** Set when the actor may read but not post: a moderator, or a thread that is locked or not open yet. */
  readOnlyReason: string | null;
};

const asMember = (u: { id: string; name: string; playerProfile: { level: string | null; photoUrl: string | null } | null }, role: ThreadMember["role"]): ThreadMember => ({
  id: u.id,
  name: u.name,
  level: u.playerProfile?.level ?? null,
  photoUrl: u.playerProfile?.photoUrl ?? null,
  role,
});

/* ------------------------------------------------------------------ Context: who belongs in a thread */

/** The lineup of a game: the organizer plus everyone who has accepted. Invited-but-undecided players wait. */
async function gameContext(gameId: string): Promise<ThreadContext> {
  const g = await db.gameSession.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      code: true,
      status: true,
      locationId: true,
      organizerId: true,
      participants: { where: { status: "ACCEPTED" }, select: { userId: true, role: true, user: { select: memberSelect } } },
    },
  });
  if (!g) throw notFound("Game");
  const members = g.participants.map((p) => asMember(p.user, p.role === "ORGANIZER" ? "ORGANIZER" : "PLAYER"));
  const live = ["OPEN", "FULL", "CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(g.status);
  return {
    kind: "GAME",
    label: `Game ${g.code}`,
    locationId: g.locationId,
    href: `/app/play/${g.code}`,
    gameId: g.id,
    members,
    open: live && members.length > 1,
    closedReason: !live ? "This game is not active." : members.length < 2 ? "Chat opens once a second player joins." : undefined,
  };
}

/** A program thread holds the coach and the enrolled players. Waitlisted players are not in it yet. */
async function programContext(programId: string): Promise<ThreadContext> {
  const p = await db.program.findUnique({
    where: { id: programId },
    select: {
      id: true,
      name: true,
      status: true,
      locationId: true,
      trainer: { select: { user: { select: memberSelect } } },
      enrollments: { where: { status: "ENROLLED" }, select: { player: { select: memberSelect } } },
    },
  });
  if (!p) throw notFound("Program");
  const members = [asMember(p.trainer.user, "COACH"), ...p.enrollments.map((e) => asMember(e.player, "PLAYER"))];
  const live = p.status !== "CANCELLED";
  return {
    kind: "PROGRAM",
    label: p.name,
    locationId: p.locationId,
    href: `/app/programs/${p.id}`,
    programId: p.id,
    members,
    open: live && members.length > 1,
    closedReason: !live ? "This program was cancelled." : members.length < 2 ? "Chat opens once the first player enrols." : undefined,
  };
}

export async function threadContext(kind: MessageThreadKind, subjectId: string): Promise<ThreadContext> {
  return kind === "GAME" ? gameContext(subjectId) : programContext(subjectId);
}

/* ------------------------------------------------------------------ Access */

type Access = { ctx: ThreadContext; member: boolean; moderator: boolean };

async function access(a: Actor, kind: MessageThreadKind, subjectId: string): Promise<Access> {
  const ctx = await threadContext(kind, subjectId);
  const member = ctx.members.some((m) => m.id === a.id);
  const moderator = member ? false : await can(a, "message.moderate", { locationId: ctx.locationId });
  if (!member && !moderator) throw forbidden("Only the people in this lineup can see these messages.");
  return { ctx, member, moderator };
}

/* ------------------------------------------------------------------ Reading */

/** Finds the thread row without creating it, so a read never writes. */
async function findThread(ctx: ThreadContext) {
  const where = ctx.kind === "GAME" ? { gameId: ctx.gameId } : { programId: ctx.programId };
  return db.messageThread.findFirst({ where, select: { id: true, lockedAt: true } });
}

/** Creates the thread on first post. Two people posting at once is fine: the unique key settles it. */
async function ensureThread(ctx: ThreadContext): Promise<{ id: string; lockedAt: Date | null }> {
  const found = await findThread(ctx);
  if (found) return found;
  try {
    return await db.messageThread.create({
      data: { kind: ctx.kind, gameId: ctx.gameId ?? null, programId: ctx.programId ?? null },
      select: { id: true, lockedAt: true },
    });
  } catch {
    const again = await findThread(ctx);
    if (!again) throw validation("Could not open this conversation. Try again.");
    return again;
  }
}

export async function getThread(actor: Actor | null, kind: MessageThreadKind, subjectId: string, opts: { take?: number } = {}): Promise<ThreadView> {
  const a = await requireActor(actor);
  const { ctx, member, moderator } = await access(a, kind, subjectId);
  const row = await findThread(ctx);
  const messages = row
    ? (await db.message.findMany({ where: { threadId: row.id }, select: messageSelect, orderBy: { createdAt: "desc" }, take: opts.take ?? 100 })).reverse()
    : [];
  const locked = !!row?.lockedAt;
  const canPost = member && ctx.open && !locked;
  return {
    id: row?.id ?? null,
    kind: ctx.kind,
    label: ctx.label,
    href: ctx.href,
    locked,
    members: ctx.members,
    messages,
    canPost,
    readOnlyReason: canPost ? null : locked ? "This conversation was locked by the club." : moderator ? "You are viewing this as a moderator." : (ctx.closedReason ?? null),
  };
}

/** Every thread the actor belongs to, newest activity first, for the messages list. */
export async function listMyThreads(actor: Actor | null): Promise<{ kind: MessageThreadKind; subjectId: string; label: string; href: string; lastAt: Date | null; lastBody: string | null; lastSender: string | null; count: number }[]> {
  const a = await requireActor(actor);
  const [games, programs] = await Promise.all([
    db.gameSession.findMany({
      where: { status: { in: ["OPEN", "FULL", "CONFIRMED", "IN_PROGRESS", "COMPLETED"] }, participants: { some: { userId: a.id, status: "ACCEPTED" } } },
      select: { id: true, code: true, startsAt: true },
      orderBy: { startsAt: "desc" },
      take: 30,
    }),
    db.program.findMany({
      where: { status: { not: "CANCELLED" }, OR: [{ enrollments: { some: { playerId: a.id, status: "ENROLLED" } } }, { trainer: { userId: a.id } }] },
      select: { id: true, name: true, startsOn: true },
      orderBy: { startsOn: "desc" },
      take: 30,
    }),
  ]);
  const subjects = [
    ...games.map((g) => ({ kind: "GAME" as const, subjectId: g.id, label: `Game ${g.code}`, href: `/app/play/${g.code}`, at: g.startsAt })),
    ...programs.map((p) => ({ kind: "PROGRAM" as const, subjectId: p.id, label: p.name, href: `/app/programs/${p.id}`, at: p.startsOn })),
  ];
  if (subjects.length === 0) return [];
  const threads = await db.messageThread.findMany({
    where: { OR: [{ gameId: { in: games.map((g) => g.id) } }, { programId: { in: programs.map((p) => p.id) } }] },
    select: {
      id: true,
      gameId: true,
      programId: true,
      _count: { select: { messages: true } },
      messages: { select: { body: true, createdAt: true, deletedAt: true, sender: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const bySubject = new Map(threads.map((t) => [t.gameId ?? t.programId ?? "", t]));
  return subjects
    .map((s) => {
      const t = bySubject.get(s.subjectId);
      const last = t?.messages[0];
      return {
        kind: s.kind,
        subjectId: s.subjectId,
        label: s.label,
        href: s.href,
        lastAt: last?.createdAt ?? null,
        lastBody: last ? (last.deletedAt ? "Message removed" : last.body.slice(0, 120)) : null,
        lastSender: last?.sender.name.split(" ")[0] ?? null,
        count: t?._count.messages ?? 0,
      };
    })
    .sort((x, y) => (y.lastAt?.getTime() ?? 0) - (x.lastAt?.getTime() ?? 0) || x.label.localeCompare(y.label));
}

/* ------------------------------------------------------------------ Posting */

export async function postMessage(actor: Actor | null, kind: MessageThreadKind, subjectId: string, input: unknown): Promise<MessageView> {
  const a = await requirePermission(actor, "message.participate");
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) throw validation("Write something first.", fieldErrors(parsed.error));
  const { ctx, member } = await access(a, kind, subjectId);
  if (!member) throw forbidden("Only the people in this lineup can post here.");
  if (!ctx.open) throw validation(ctx.closedReason ?? "This conversation is closed.");
  const thread = await ensureThread(ctx);
  if (thread.lockedAt) throw validation("This conversation was locked by the club.");
  const message = await db.message.create({ data: { threadId: thread.id, senderId: a.id, body: parsed.data.body }, select: messageSelect });
  // One grouped, rate-limited notification per other member: a busy thread never floods the centre.
  await notifyMany(
    ctx.members.filter((m) => m.id !== a.id).map((m) => m.id),
    { type: "message.new", url: `${ctx.href}#chat`, groupKey: thread.id, data: { sender: a.name.split(" ")[0], thread: ctx.label, excerpt: parsed.data.body.slice(0, 140) } },
  );
  return message;
}

/* ------------------------------------------------------------------ Reporting and moderation */

export async function reportMessage(actor: Actor | null, messageId: string, input: unknown): Promise<{ reportId: string }> {
  const a = await requireActor(actor);
  const parsed = messageReportSchema.safeParse(input);
  if (!parsed.success) throw validation("Pick a reason.", fieldErrors(parsed.error));
  const m = await db.message.findUnique({
    where: { id: messageId },
    select: { id: true, senderId: true, thread: { select: { id: true, kind: true, gameId: true, programId: true } } },
  });
  if (!m) throw notFound("Message");
  const { ctx } = await access(a, m.thread.kind, (m.thread.gameId ?? m.thread.programId)!);
  if (m.senderId === a.id) throw validation("You cannot report your own message.");
  const report = await db.messageReport.upsert({
    where: { messageId_reporterId: { messageId, reporterId: a.id } },
    create: { messageId, reporterId: a.id, reason: parsed.data.reason, note: parsed.data.note ?? null },
    update: { reason: parsed.data.reason, note: parsed.data.note ?? null, status: "OPEN", reviewedAt: null, reviewedById: null, outcome: null },
    select: { id: true },
  });
  await audit({ actorId: a.id, action: "message.reported", entityType: "Message", entityId: messageId, locationId: ctx.locationId, metadata: { reason: parsed.data.reason } });
  const moderators = await staffWhoCanModerate(ctx.locationId);
  await notifyMany(moderators, { type: "message.reported", url: "/admin/moderation", groupKey: m.thread.id, data: { reason: parsed.data.reason, thread: ctx.label } });
  return { reportId: report.id };
}

/** Active staff at the location whose role may moderate messages. */
async function staffWhoCanModerate(locationId: string): Promise<string[]> {
  const [rows, owners] = await Promise.all([
    db.staffMembership.findMany({ where: { locationId, status: "ACTIVE", role: { in: ["LOCATION_MANAGER", "RECEPTIONIST"] } }, select: { userId: true } }),
    db.user.findMany({ where: { status: "ACTIVE", globalRole: { in: ["SUPER_ADMIN", "ACADEMY_OWNER"] } }, select: { id: true } }),
  ]);
  return [...new Set([...rows.map((r) => r.userId), ...owners.map((o) => o.id)])];
}

export type ReportRow = Awaited<ReturnType<typeof listReports>>[number];

export async function listReports(actor: Actor | null, opts: { status?: "OPEN" | "ACTIONED" | "DISMISSED" } = {}) {
  const a = await requirePermission(actor, "message.moderate");
  const scope = await accessibleLocationIds(a, "message.moderate");
  const rows = await db.messageReport.findMany({
    where: { ...(opts.status ? { status: opts.status } : {}) },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      reason: true,
      note: true,
      status: true,
      outcome: true,
      createdAt: true,
      reviewedAt: true,
      reporter: { select: { id: true, name: true } },
      reviewedBy: { select: { name: true } },
      message: {
        select: {
          id: true,
          body: true,
          createdAt: true,
          deletedAt: true,
          sender: { select: { id: true, name: true } },
          thread: { select: { id: true, kind: true, lockedAt: true, game: { select: { id: true, code: true, locationId: true } }, program: { select: { id: true, name: true, locationId: true } } } },
        },
      },
    },
  });
  return rows
    .map((r) => {
      const t = r.message.thread;
      const locationId = t.game?.locationId ?? t.program?.locationId ?? null;
      return { ...r, locationId, threadLabel: t.game ? `Game ${t.game.code}` : (t.program?.name ?? "Conversation"), threadLocked: !!t.lockedAt };
    })
    .filter((r) => scope === "all" || (r.locationId && scope.includes(r.locationId)));
}

export async function countOpenReports(actor: Actor | null): Promise<number> {
  const rows = await listReports(actor, { status: "OPEN" });
  return rows.length;
}

/**
 * A moderator decides on a report: dismiss it, or action it and optionally remove the message. Removal is a
 * soft delete so the report and the audit trail keep pointing at something real.
 */
export async function decideReport(actor: Actor | null, reportId: string, input: unknown) {
  const a = await requirePermission(actor, "message.moderate");
  const parsed = reportDecisionSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const report = await db.messageReport.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      messageId: true,
      message: { select: { senderId: true, deletedAt: true, thread: { select: { id: true, kind: true, game: { select: { code: true, locationId: true } }, program: { select: { name: true, locationId: true } } } } } },
    },
  });
  if (!report) throw notFound("Report");
  const t = report.message.thread;
  const locationId = t.game?.locationId ?? t.program?.locationId;
  if (!locationId) throw notFound("Report");
  await requirePermission(a, "message.moderate", { locationId });
  const label = t.game ? `Game ${t.game.code}` : (t.program?.name ?? "Conversation");
  const remove = parsed.data.decision === "ACTIONED" && parsed.data.removeMessage;

  await db.$transaction(async (tx) => {
    await tx.messageReport.update({
      where: { id: reportId },
      data: { status: parsed.data.decision, reviewedById: a.id, reviewedAt: new Date(), outcome: parsed.data.outcome ?? null },
    });
    if (remove && !report.message.deletedAt) await tx.message.update({ where: { id: report.messageId }, data: { deletedAt: new Date(), deletedById: a.id } });
    await audit(
      { actorId: a.id, action: "message.moderated", entityType: "MessageReport", entityId: reportId, locationId, metadata: { decision: parsed.data.decision, removed: remove } },
      tx,
    );
  });
  if (remove) await notify(report.message.senderId, { type: "message.removed", url: "/app/messages", data: { thread: label } });
  return { ok: true as const, removed: remove };
}

/** Locks or unlocks a whole thread. A locked thread is readable but nobody can post. */
export async function setThreadLock(actor: Actor | null, threadId: string, locked: boolean) {
  const a = await requirePermission(actor, "message.moderate");
  const t = await db.messageThread.findUnique({
    where: { id: threadId },
    select: { id: true, game: { select: { locationId: true } }, program: { select: { locationId: true } } },
  });
  if (!t) throw notFound("Conversation");
  const locationId = t.game?.locationId ?? t.program?.locationId;
  if (!locationId) throw notFound("Conversation");
  await requirePermission(a, "message.moderate", { locationId });
  await db.messageThread.update({ where: { id: threadId }, data: { lockedAt: locked ? new Date() : null, lockedById: locked ? a.id : null } });
  await audit({ actorId: a.id, action: locked ? "message.thread_locked" : "message.thread_unlocked", entityType: "MessageThread", entityId: threadId, locationId });
  return { ok: true as const };
}
