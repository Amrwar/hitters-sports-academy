import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/auth/password";
import * as auth from "@/server/services/auth";
import { issueSession, resolveSession, revokeAllSessions, revokeSession } from "@/server/services/sessions";
import { expectCode, lastMailTo, makeUser, PASSWORD, tokenFromMail } from "./helpers";

describe("passwords", () => {
  it("hashes with scrypt and verifies", async () => {
    const hash = await hashPassword("Str0ng-pass-word");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("Str0ng-pass-word", hash)).toBe(true);
    expect(await verifyPassword("wrong-pass-word1", hash)).toBe(false);
    expect(needsRehash(hash)).toBe(false);
    expect(needsRehash("scrypt$1024$8$1$abc$def")).toBe(true);
  });
});

describe("registration", () => {
  it("creates a user with a player profile, sends a verification mail and starts a session", async () => {
    const res = await auth.register({ name: "Nour El Din", email: "Nour@Example.com", phone: "01012345678", password: "padel-rocks-99" });
    const user = await db.user.findUniqueOrThrow({ where: { id: res.userId }, include: { playerProfile: true } });
    expect(user.email).toBe("nour@example.com");
    expect(user.phone).toBe("+201012345678");
    expect(user.playerProfile).not.toBeNull();
    expect(user.emailVerifiedAt).toBeNull();
    expect(lastMailTo("nour@example.com")?.subject).toMatch(/verify/i);
    const actor = await resolveSession(res.sessionToken);
    expect(actor?.id).toBe(user.id);
    const log = await db.auditLog.findFirst({ where: { action: "user.register", entityId: user.id } });
    expect(log).not.toBeNull();
  });

  it("rejects weak input with field errors", async () => {
    await expectCode(auth.register({ name: "A", email: "nope", password: "short" }), "VALIDATION");
  });

  it("rejects duplicate email and phone", async () => {
    await auth.register({ name: "First", email: "dup@example.com", phone: "+201111111111", password: "padel-rocks-99" });
    await expectCode(auth.register({ name: "Second", email: "DUP@example.com", password: "padel-rocks-99" }), "CONFLICT");
    await expectCode(auth.register({ name: "Third", email: "other@example.com", phone: "+201111111111", password: "padel-rocks-99" }), "CONFLICT");
  });

  it("verifies the email with the mailed token exactly once", async () => {
    const res = await auth.register({ name: "Verify Me", email: "v@example.com", password: "padel-rocks-99" });
    const token = tokenFromMail(lastMailTo("v@example.com")!.text, "token");
    await auth.verifyEmail({ token });
    const user = await db.user.findUniqueOrThrow({ where: { id: res.userId } });
    expect(user.emailVerifiedAt).not.toBeNull();
    await expectCode(auth.verifyEmail({ token }), "INVALID_TOKEN");
    await expectCode(auth.verifyEmail({ token: "not-a-real-token-value" }), "INVALID_TOKEN");
  });
});

describe("login and sessions", () => {
  it("logs in with correct credentials and records the login", async () => {
    const { user } = await makeUser({ email: "login@example.com" });
    const res = await auth.login({ email: "LOGIN@example.com", password: PASSWORD });
    expect(res.userId).toBe(user.id);
    const actor = await resolveSession(res.sessionToken);
    expect(actor?.email).toBe("login@example.com");
    const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.lastLoginAt).not.toBeNull();
  });

  it("rejects wrong password and unknown email with the same error", async () => {
    await makeUser({ email: "x@example.com" });
    await expectCode(auth.login({ email: "x@example.com", password: "wrong-password-1" }), "VALIDATION");
    await expectCode(auth.login({ email: "ghost@example.com", password: "wrong-password-1" }), "VALIDATION");
    const failed = await db.auditLog.count({ where: { action: "user.login_failed" } });
    expect(failed).toBe(2);
  });

  it("blocks suspended accounts", async () => {
    await makeUser({ email: "s@example.com", status: "SUSPENDED" });
    await expectCode(auth.login({ email: "s@example.com", password: PASSWORD }), "FORBIDDEN");
  });

  it("rate limits repeated failures", async () => {
    await makeUser({ email: "rl@example.com" });
    for (let i = 0; i < 10; i++) await expectCode(auth.login({ email: "rl@example.com", password: "wrong-password-1" }), "VALIDATION");
    await expectCode(auth.login({ email: "rl@example.com", password: PASSWORD }), "RATE_LIMITED");
  });

  it("revokes sessions on logout and ignores expired ones", async () => {
    const { user } = await makeUser();
    const { token } = await issueSession(user.id);
    expect(await resolveSession(token)).not.toBeNull();
    await revokeSession(token);
    expect(await resolveSession(token)).toBeNull();

    const { token: t2, session } = await issueSession(user.id);
    await db.session.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await resolveSession(t2)).toBeNull();
    expect(await resolveSession("garbage")).toBeNull();
    expect(await resolveSession(undefined)).toBeNull();
  });

  it("drops sessions of suspended users", async () => {
    const { user } = await makeUser();
    const { token } = await issueSession(user.id);
    await db.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
    const actor = await resolveSession(token);
    expect(actor?.status).toBe("SUSPENDED");
    await revokeAllSessions(user.id);
    expect(await resolveSession(token)).toBeNull();
  });
});

describe("password reset", () => {
  it("resets with a mailed token, invalidates other sessions, and verifies the email", async () => {
    const { user } = await makeUser({ email: "reset@example.com", verified: false });
    const { token: oldSession } = await issueSession(user.id);
    await auth.requestPasswordReset({ email: "reset@example.com" });
    const token = tokenFromMail(lastMailTo("reset@example.com")!.text, "token");
    const res = await auth.resetPassword({ token, password: "brand-new-pass-7" });
    expect(await resolveSession(oldSession)).toBeNull();
    expect(await resolveSession(res.sessionToken)).not.toBeNull();
    await expectCode(auth.login({ email: "reset@example.com", password: PASSWORD }), "VALIDATION");
    const again = await auth.login({ email: "reset@example.com", password: "brand-new-pass-7" });
    expect(again.userId).toBe(user.id);
    const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.emailVerifiedAt).not.toBeNull();
    await expectCode(auth.resetPassword({ token, password: "brand-new-pass-8" }), "INVALID_TOKEN");
  });

  it("does not reveal whether an email exists", async () => {
    const res = await auth.requestPasswordReset({ email: "nobody@example.com" });
    expect(res.sent).toBe(true);
    expect(lastMailTo("nobody@example.com")).toBeUndefined();
  });

  it("changes password with the current one and keeps the current session", async () => {
    const { user, actor } = await makeUser();
    const { token: keep } = await issueSession(user.id);
    const { token: other } = await issueSession(user.id);
    await expectCode(auth.changePassword(actor, { currentPassword: "nope-nope-nope-1", newPassword: "another-pass-22" }, keep), "VALIDATION");
    await auth.changePassword(actor, { currentPassword: PASSWORD, newPassword: "another-pass-22" }, keep);
    expect(await resolveSession(keep)).not.toBeNull();
    expect(await resolveSession(other)).toBeNull();
  });
});
