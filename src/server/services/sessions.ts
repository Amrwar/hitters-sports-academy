import { db } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import type { Actor } from "@/lib/auth/authorize";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TOUCH_INTERVAL_MS = 60 * 60 * 1000; // refresh lastSeen / expiry at most hourly

export async function buildActor(userId: string): Promise<Actor | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { playerProfile: { select: { id: true } }, memberships: { where: { status: "ACTIVE" }, select: { locationId: true, role: true } } },
  });
  if (!user || user.status === "DELETED") return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    globalRole: user.globalRole,
    emailVerifiedAt: user.emailVerifiedAt,
    playerProfileId: user.playerProfile?.id ?? null,
    memberships: user.memberships,
  };
}

/** Creates a DB session and returns the opaque token for the cookie. */
export async function issueSession(userId: string, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  const token = generateToken();
  const session = await db.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS), ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null },
  });
  return { token, session };
}

/** Resolves a cookie token to an Actor, sliding the expiry. Returns null for unknown, expired or revoked sessions. */
export async function resolveSession(token: string | undefined | null): Promise<Actor | null> {
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now), expiresAt: new Date(now + SESSION_TTL_MS) } });
  }
  return buildActor(session.userId);
}

export async function revokeSession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function revokeAllSessions(userId: string, exceptToken?: string): Promise<number> {
  const res = await db.session.deleteMany({ where: { userId, ...(exceptToken ? { NOT: { tokenHash: hashToken(exceptToken) } } : {}) } });
  return res.count;
}

export async function purgeExpiredSessions(): Promise<number> {
  const res = await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return res.count;
}
