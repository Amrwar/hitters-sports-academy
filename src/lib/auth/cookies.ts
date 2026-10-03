import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Actor } from "./authorize";
import { isStaff } from "./authorize";
import { resolveSession, revokeSession, SESSION_TTL_MS } from "@/server/services/sessions";

export const SESSION_COOKIE = "hitters_session";

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  await revokeSession(token);
  store.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}

export async function getSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

/** The current request's actor, resolved once per request. Null when signed out. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const token = await getSessionToken();
  return resolveSession(token);
});

/** For layouts/pages: redirects to login when signed out. Services still verify permissions on every call. */
export async function requireActorOrRedirect(next?: string): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  if (actor.status !== "ACTIVE") {
    await clearSessionCookie();
    redirect("/login?suspended=1");
  }
  return actor;
}

export async function requireStaffOrRedirect(): Promise<Actor> {
  const actor = await requireActorOrRedirect("/admin");
  if (!isStaff(actor)) redirect("/app?denied=admin");
  return actor;
}

/** Request metadata for audit and rate limiting. */
export async function requestMeta() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  return { ip, userAgent: h.get("user-agent") };
}
