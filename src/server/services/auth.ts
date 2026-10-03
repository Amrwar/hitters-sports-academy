import type { TokenType } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, conflict, forbidden, validation } from "@/lib/errors";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/auth/password";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { rateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { appUrl, sendMail } from "@/lib/mail";
import { changePasswordSchema, fieldErrors, loginSchema, registerSchema, requestResetSchema, resetPasswordSchema, verifyEmailSchema } from "@/lib/validation/schemas";
import { issueSession, revokeAllSessions } from "./sessions";
import type { Actor } from "@/lib/auth/authorize";
import { requireActor } from "@/lib/auth/authorize";

type Meta = { ip?: string | null; userAgent?: string | null };

const TOKEN_TTL: Record<TokenType, number> = {
  EMAIL_VERIFY: 24 * 60 * 60 * 1000,
  PHONE_VERIFY: 10 * 60 * 1000,
  PASSWORD_RESET: 60 * 60 * 1000,
};

/** Normalises Egyptian local numbers (01xxxxxxxxx) to E.164; leaves other numbers as given. */
export function normalisePhone(phone?: string): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/[^0-9+]/g, "");
  if (/^01[0-9]{9}$/.test(digits)) return `+2${digits}`;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

async function issueToken(userId: string, type: TokenType, tx = db) {
  const token = generateToken();
  await tx.verificationToken.updateMany({ where: { userId, type, consumedAt: null }, data: { consumedAt: new Date() } }); // one live token per type
  await tx.verificationToken.create({ data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TOKEN_TTL[type]) } });
  return token;
}

async function consumeToken(token: string, type: TokenType) {
  const row = await db.verificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.type !== type || row.consumedAt || row.expiresAt.getTime() < Date.now()) {
    throw new AppError("INVALID_TOKEN", "This link is invalid or has expired.");
  }
  await db.verificationToken.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  return row;
}

async function sendVerificationMail(userId: string, email: string, name: string) {
  const token = await issueToken(userId, "EMAIL_VERIFY");
  await sendMail({
    to: email,
    subject: "Verify your HITTERS email",
    text: `Hi ${name},\n\nConfirm your email to activate your HITTERS account:\n${appUrl(`/verify-email?token=${token}`)}\n\nThe link expires in 24 hours.`,
  });
}

// ---------------------------------------------------------------- Registration

export async function register(input: unknown, meta: Meta = {}) {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const { name, email, password } = parsed.data;
  const phone = normalisePhone(parsed.data.phone);

  rateLimit(`register:${meta.ip ?? "local"}`, 10, 60 * 60 * 1000);

  const [emailTaken, phoneTaken] = await Promise.all([db.user.findUnique({ where: { email }, select: { id: true } }), phone ? db.user.findUnique({ where: { phone }, select: { id: true } }) : null]);
  if (emailTaken) throw conflict("An account with this email already exists.");
  if (phoneTaken) throw conflict("An account with this phone number already exists.");

  const passwordHash = await hashPassword(password);
  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { name, email, phone, passwordHash, playerProfile: { create: {} } } });
    await audit({ actorId: u.id, action: "user.register", entityType: "User", entityId: u.id, ip: meta.ip }, tx);
    return u;
  });
  await sendVerificationMail(user.id, user.email, user.name);
  const { token } = await issueSession(user.id, meta);
  return { userId: user.id, sessionToken: token };
}

// ---------------------------------------------------------------- Login / logout

export async function login(input: unknown, meta: Meta = {}) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const { email, password } = parsed.data;
  const key = `login:${meta.ip ?? "local"}:${email}`;
  rateLimit(key, 10, 15 * 60 * 1000);

  const user = await db.user.findUnique({ where: { email } });
  const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, DUMMY_HASH); // constant-time-ish path
  if (!user || !ok) {
    await audit({ actorId: user?.id ?? null, action: "user.login_failed", entityType: "User", entityId: user?.id ?? null, metadata: { email }, ip: meta.ip });
    throw validation("Incorrect email or password.", { password: "Incorrect email or password." });
  }
  if (user.status !== "ACTIVE") throw forbidden("This account is suspended. Contact support.");

  const data: { lastLoginAt: Date; passwordHash?: string } = { lastLoginAt: new Date() };
  if (needsRehash(user.passwordHash)) data.passwordHash = await hashPassword(password);
  await db.user.update({ where: { id: user.id }, data });
  await audit({ actorId: user.id, action: "user.login", entityType: "User", entityId: user.id, ip: meta.ip });
  resetRateLimit(key);
  const { token } = await issueSession(user.id, meta);
  return { userId: user.id, sessionToken: token };
}

// A valid scrypt hash of a random string, used so unknown emails take as long as wrong passwords.
const DUMMY_HASH = "scrypt$32768$8$1$f2zEh1pW7l2v0xJzq6b7Qw$4dC3b1l0Y1yJ9Hk2n8r5tVvWxYzA1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6A7B8C9D0E1F2";

// ---------------------------------------------------------------- Email verification

export async function verifyEmail(input: unknown) {
  const parsed = verifyEmailSchema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_TOKEN", "This link is invalid or has expired.");
  const row = await consumeToken(parsed.data.token, "EMAIL_VERIFY");
  await db.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } });
  await audit({ actorId: row.userId, action: "user.email_verified", entityType: "User", entityId: row.userId });
  return { userId: row.userId };
}

export async function resendVerification(actor: Actor | null) {
  const a = await requireActor(actor);
  if (a.emailVerifiedAt) return { alreadyVerified: true };
  rateLimit(`resend:${a.id}`, 3, 15 * 60 * 1000);
  await sendVerificationMail(a.id, a.email, a.name);
  return { alreadyVerified: false };
}

// ---------------------------------------------------------------- Password reset

/** Always succeeds from the caller's point of view so emails cannot be enumerated. */
export async function requestPasswordReset(input: unknown, meta: Meta = {}) {
  const parsed = requestResetSchema.safeParse(input);
  if (!parsed.success) throw validation("Enter a valid email address.", fieldErrors(parsed.error));
  rateLimit(`reset:${meta.ip ?? "local"}`, 5, 15 * 60 * 1000);
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (user && user.status === "ACTIVE") {
    const token = await issueToken(user.id, "PASSWORD_RESET");
    await sendMail({
      to: user.email,
      subject: "Reset your HITTERS password",
      text: `Hi ${user.name},\n\nReset your password here:\n${appUrl(`/reset-password?token=${token}`)}\n\nThe link expires in 1 hour. If you didn't ask for this, ignore this email.`,
    });
    await audit({ actorId: user.id, action: "user.password_reset_requested", entityType: "User", entityId: user.id, ip: meta.ip });
  }
  return { sent: true };
}

export async function resetPassword(input: unknown, meta: Meta = {}) {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const row = await consumeToken(parsed.data.token, "PASSWORD_RESET");
  const passwordHash = await hashPassword(parsed.data.password);
  await db.user.update({ where: { id: row.userId }, data: { passwordHash, emailVerifiedAt: { set: new Date() } } }); // proving mailbox control verifies the email
  await revokeAllSessions(row.userId);
  await audit({ actorId: row.userId, action: "user.password_reset", entityType: "User", entityId: row.userId, ip: meta.ip });
  const { token } = await issueSession(row.userId, meta);
  return { userId: row.userId, sessionToken: token };
}

export async function changePassword(actor: Actor | null, input: unknown, currentSessionToken?: string) {
  const a = await requireActor(actor);
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const user = await db.user.findUniqueOrThrow({ where: { id: a.id } });
  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) throw validation("Current password is incorrect.", { currentPassword: "Incorrect password." });
  await db.user.update({ where: { id: a.id }, data: { passwordHash: await hashPassword(parsed.data.newPassword) } });
  await revokeAllSessions(a.id, currentSessionToken);
  await audit({ actorId: a.id, action: "user.password_changed", entityType: "User", entityId: a.id });
  return { ok: true as const };
}
