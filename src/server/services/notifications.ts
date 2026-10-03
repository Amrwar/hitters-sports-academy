import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { requireActor, requirePermission, type Actor } from "@/lib/auth/authorize";

export type NotifyInput = { type: string; title: string; body: string; data?: Prisma.InputJsonValue };

/** Internal: creates an in-app notification. Other channels are queued (status PENDING) for a delivery worker. */
export async function notify(userId: string, input: NotifyInput, channel: "IN_APP" | "EMAIL" | "SMS" | "PUSH" = "IN_APP") {
  return db.notification.create({
    data: { userId, ...input, channel, status: channel === "IN_APP" ? "SENT" : "PENDING", sentAt: channel === "IN_APP" ? new Date() : null },
  });
}

/** Staff-initiated message to a player at one of the actor's locations. */
export async function sendNotification(actor: Actor | null, userId: string, locationId: string, input: NotifyInput) {
  const a = await requirePermission(actor, "notification.send", { locationId });
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw notFound("User");
  return notify(userId, { ...input, data: { ...(typeof input.data === "object" && input.data ? (input.data as object) : {}), locationId, sentBy: a.id } });
}

export async function listMyNotifications(actor: Actor | null, take = 50) {
  const a = await requireActor(actor);
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: a.id, channel: "IN_APP" }, orderBy: { createdAt: "desc" }, take }),
    db.notification.count({ where: { userId: a.id, channel: "IN_APP", readAt: null } }),
  ]);
  return { items, unread };
}

export async function markNotificationRead(actor: Actor | null, notificationId: string) {
  const a = await requireActor(actor);
  const res = await db.notification.updateMany({ where: { id: notificationId, userId: a.id, readAt: null }, data: { readAt: new Date() } });
  if (res.count === 0) {
    const exists = await db.notification.findFirst({ where: { id: notificationId, userId: a.id }, select: { id: true } });
    if (!exists) throw notFound("Notification");
  }
  return { ok: true as const };
}

export async function markAllNotificationsRead(actor: Actor | null) {
  const a = await requireActor(actor);
  const res = await db.notification.updateMany({ where: { userId: a.id, readAt: null }, data: { readAt: new Date() } });
  return { updated: res.count };
}
