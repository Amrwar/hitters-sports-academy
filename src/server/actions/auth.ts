"use server";

import { redirect } from "next/navigation";
import { toActionError, type ActionResult } from "@/lib/errors";
import { clearSessionCookie, getActor, requestMeta, setSessionCookie } from "@/lib/auth/cookies";
import * as auth from "@/server/services/auth";

function formToObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === "string") out[k] = v;
  });
  return out;
}

/** Only allow relative in-app redirect targets. */
function safeNext(next: unknown, fallback: string): string {
  return typeof next === "string" && /^\/(?!\/)/.test(next) ? next : fallback;
}

export async function registerAction(form: FormData): Promise<ActionResult<{ next: string }>> {
  try {
    const meta = await requestMeta();
    const { sessionToken } = await auth.register(formToObject(form), meta);
    await setSessionCookie(sessionToken);
    return { ok: true, data: { next: "/splash" } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function loginAction(form: FormData): Promise<ActionResult<{ next: string }>> {
  try {
    const meta = await requestMeta();
    const data = formToObject(form);
    const { sessionToken } = await auth.login(data, meta);
    await setSessionCookie(sessionToken);
    return { ok: true, data: { next: safeNext(data.next, "/splash") } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function logoutAction(): Promise<never> {
  await clearSessionCookie();
  redirect("/login");
}

export async function requestPasswordResetAction(form: FormData): Promise<ActionResult<{ sent: boolean }>> {
  try {
    const meta = await requestMeta();
    const res = await auth.requestPasswordReset(formToObject(form), meta);
    return { ok: true, data: res };
  } catch (e) {
    return toActionError(e);
  }
}

export async function resetPasswordAction(form: FormData): Promise<ActionResult<{ next: string }>> {
  try {
    const meta = await requestMeta();
    const { sessionToken } = await auth.resetPassword(formToObject(form), meta);
    await setSessionCookie(sessionToken);
    return { ok: true, data: { next: "/app" } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function verifyEmailAction(token: string): Promise<ActionResult<{ userId: string }>> {
  try {
    const res = await auth.verifyEmail({ token });
    return { ok: true, data: res };
  } catch (e) {
    return toActionError(e);
  }
}

export async function resendVerificationAction(): Promise<ActionResult<{ alreadyVerified: boolean }>> {
  try {
    const res = await auth.resendVerification(await getActor());
    return { ok: true, data: res };
  } catch (e) {
    return toActionError(e);
  }
}

export async function changePasswordAction(form: FormData): Promise<ActionResult<{ ok: true }>> {
  try {
    const { getSessionToken } = await import("@/lib/auth/cookies");
    const res = await auth.changePassword(await getActor(), formToObject(form), await getSessionToken());
    return { ok: true, data: res };
  } catch (e) {
    return toActionError(e);
  }
}
