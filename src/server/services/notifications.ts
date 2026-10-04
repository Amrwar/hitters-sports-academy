import type { NotificationCategory, NotificationChannel, NotificationTemplate, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { forbidden, notFound, validation } from "@/lib/errors";
import { accessibleLocationIds, requireActor, requirePermission, type Actor } from "@/lib/auth/authorize";
import { CATEGORY_LABEL, NOTIFICATION_CATALOG, NOTIFICATION_TYPES, defFor, render, type NotificationType } from "@/lib/notifications";
import { announcementSchema, fieldErrors, notificationPreferencesSchema, notificationTemplateSchema } from "@/lib/validation/schemas";

/* ------------------------------------------------------------------ Channel abstraction */

export type ChannelPayload = { notificationId: string; userId: string; email: string; phone: string | null; name: string; title: string; body: string; url: string | null; data: Prisma.JsonValue | null };
/** Returns a provider reference when the channel accepted the message; throwing marks the delivery FAILED. */
export type ChannelSender = (payload: ChannelPayload) => Promise<{ provider: string; providerRef?: string }>;

const senders = new Map<NotificationChannel, ChannelSender>();

/**
 * Registers the worker for one channel. Nothing is registered for EMAIL, PUSH or SMS yet, so their
 * deliveries sit PENDING until a provider is wired; connecting one is this single call plus credentials.
 */
export function registerChannelSender(channel: NotificationChannel, sender: ChannelSender) {
  senders.set(channel, sender);
}
export const channelIsLive = (channel: NotificationChannel) => channel === "IN_APP" || senders.has(channel);

/** Unregisters every sender. Used by tests, and by a worker that is swapping providers. */
export function clearChannelSenders() {
  senders.clear();
}

/* ------------------------------------------------------------------ Templates */

let templateCache: { rows: Map<string, NotificationTemplate>; at: number } | null = null;
const TEMPLATE_TTL_MS = 60_000;

async function templates(force = false): Promise<Map<string, NotificationTemplate>> {
  if (!force && templateCache && Date.now() - templateCache.at < TEMPLATE_TTL_MS) return templateCache.rows;
  const rows = new Map((await db.notificationTemplate.findMany()).map((t) => [t.type, t]));
  templateCache = { rows, at: Date.now() };
  return rows;
}
export function invalidateTemplateCache() {
  templateCache = null;
}

/** Writes any catalogue type missing from the database. Safe to run on every deploy; never overwrites edits. */
export async function seedNotificationTemplates(client: typeof db = db): Promise<{ created: number; refreshed: number; total: number }> {
  const rows = await client.notificationTemplate.findMany({ select: { type: true, title: true, body: true, updatedById: true } });
  const existing = new Map(rows.map((t) => [t.type, t]));
  const missing = NOTIFICATION_TYPES.filter((t) => !existing.has(t));
  if (missing.length) {
    await client.notificationTemplate.createMany({
      data: missing.map((type) => {
        const def = NOTIFICATION_CATALOG[type];
        return { type, category: def.category, title: def.title, body: def.body, channels: [...def.channels] };
      }),
      skipDuplicates: true,
    });
  }

  // A template nobody has edited should follow the product's own wording as that wording improves. Once an
  // administrator saves one, updatedById is set and it is never touched again.
  const stale = NOTIFICATION_TYPES.filter((type) => {
    const row = existing.get(type);
    if (!row || row.updatedById) return false;
    const def = NOTIFICATION_CATALOG[type];
    return row.title !== def.title || row.body !== def.body;
  });
  for (const type of stale) {
    const def = NOTIFICATION_CATALOG[type];
    await client.notificationTemplate.update({ where: { type }, data: { title: def.title, body: def.body, category: def.category } });
  }

  invalidateTemplateCache();
  return { created: missing.length, refreshed: stale.length, total: NOTIFICATION_TYPES.length };
}

export async function listTemplates(actor: Actor | null) {
  await requirePermission(actor, "notification.configure");
  await seedNotificationTemplates();
  const rows = await db.notificationTemplate.findMany({ orderBy: [{ category: "asc" }, { type: "asc" }], include: { updatedBy: { select: { name: true } } } });
  return rows.map((r) => ({ ...r, vars: defFor(r.type)?.vars ?? [], defaults: defFor(r.type) ? { title: NOTIFICATION_CATALOG[r.type as NotificationType].title, body: NOTIFICATION_CATALOG[r.type as NotificationType].body } : null }));
}

export async function updateTemplate(actor: Actor | null, type: string, input: unknown) {
  const a = await requirePermission(actor, "notification.configure");
  const parsed = notificationTemplateSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const def = defFor(type);
  if (!def) throw notFound("Notification type");
  const unknown = [...parsed.data.title.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g), ...parsed.data.body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]).filter((v) => !def.vars.includes(v));
  if (unknown.length) throw validation(`Unknown placeholder${unknown.length > 1 ? "s" : ""}: ${[...new Set(unknown)].join(", ")}. Available: ${def.vars.join(", ") || "none"}.`, { body: "Unknown placeholder" });
  const row = await db.$transaction(async (tx) => {
    const t = await tx.notificationTemplate.upsert({
      where: { type },
      create: { type, category: def.category, ...parsed.data },
      update: { ...parsed.data, updatedById: a.id },
    });
    await audit({ actorId: a.id, action: "notification.template_updated", entityType: "NotificationTemplate", entityId: t.id, metadata: { type, enabled: parsed.data.enabled, channels: parsed.data.channels } }, tx);
    return t;
  });
  invalidateTemplateCache();
  return row;
}

export async function resetTemplate(actor: Actor | null, type: string) {
  const a = await requirePermission(actor, "notification.configure");
  const def = defFor(type);
  if (!def) throw notFound("Notification type");
  const row = await db.notificationTemplate.upsert({
    where: { type },
    create: { type, category: def.category, title: def.title, body: def.body, channels: [...def.channels] },
    update: { title: def.title, body: def.body, channels: [...def.channels], enabled: true, updatedById: a.id },
  });
  invalidateTemplateCache();
  return row;
}

/* ------------------------------------------------------------------ Preferences */

export type PreferenceRow = { category: NotificationCategory; inApp: boolean; email: boolean; push: boolean; sms: boolean };

const DEFAULT_PREF: Omit<PreferenceRow, "category"> = { inApp: true, email: true, push: false, sms: false };

export async function getPreferences(userId: string): Promise<Map<NotificationCategory, PreferenceRow>> {
  const rows = await db.notificationPreference.findMany({ where: { userId } });
  return new Map(rows.map((r) => [r.category, { category: r.category, inApp: r.inApp, email: r.email, push: r.push, sms: r.sms }]));
}

export async function getMyPreferences(actor: Actor | null): Promise<PreferenceRow[]> {
  const a = await requireActor(actor);
  const saved = await getPreferences(a.id);
  return (Object.keys(CATEGORY_LABEL) as NotificationCategory[]).map((category) => saved.get(category) ?? { category, ...DEFAULT_PREF });
}

export async function updateMyPreferences(actor: Actor | null, input: unknown): Promise<PreferenceRow[]> {
  const a = await requireActor(actor);
  const parsed = notificationPreferencesSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  await db.$transaction(
    parsed.data.rows.map((r) =>
      db.notificationPreference.upsert({ where: { userId_category: { userId: a.id, category: r.category } }, create: { userId: a.id, ...r }, update: { inApp: r.inApp, email: r.email, push: r.push, sms: r.sms } }),
    ),
  );
  return getMyPreferences(a);
}

/* ------------------------------------------------------------------ Creating notifications */

export type NotifyInput = {
  type: NotificationType | (string & {});
  data?: Record<string, unknown>;
  /** Where tapping it goes. */
  url?: string | null;
  /** Related notifications sharing this key collapse into one row in the centre. */
  groupKey?: string | null;
  /** Suppresses a repeat inside the type's quiet window; defaults to type + groupKey. */
  dedupeKey?: string | null;
};

type NotifyResult = { id: string; created: boolean; channels: NotificationChannel[] } | null;

export type NotifyOptions = {
  now?: Date;
  /** Write inside a caller's transaction. Outbound channels are then left to the next dispatch pass. */
  tx?: Prisma.TransactionClient;
  /** Set false to queue the outbound channels without handing them to a provider yet. */
  dispatch?: boolean;
};

/**
 * The single way anything in HITTERS reaches a person. Resolves the admin template (falling back to the
 * catalogue), narrows the channels by that person's preferences, suppresses a repeat inside the quiet
 * window, writes the notification and one delivery row per channel, then hands live channels to their sender.
 * Returns null when the type is disabled or the person has muted every channel for its category.
 */
export async function notify(userId: string, input: NotifyInput, opts: NotifyOptions = {}): Promise<NotifyResult> {
  const client = opts.tx ?? db;
  const now = opts.now ?? new Date();
  const def = defFor(input.type);
  if (!def) {
    // An unknown type is a programming error; drop it rather than send a notification nobody can configure.
    console.warn(`[notify] unknown notification type "${input.type}"`);
    return null;
  }
  const tpl = (await templates()).get(input.type);
  if (tpl && !tpl.enabled) return null;

  const category = tpl?.category ?? def.category;
  const title = render(tpl?.title ?? def.title, input.data);
  const body = render(tpl?.body ?? def.body, input.data);
  if (!title) return null;

  const allowed = tpl?.channels?.length ? tpl.channels : def.channels;
  const prefs = (await getPreferences(userId)).get(category) ?? { category, ...DEFAULT_PREF };
  const enabledByUser: Record<NotificationChannel, boolean> = { IN_APP: prefs.inApp, EMAIL: prefs.email, PUSH: prefs.push, SMS: prefs.sms };
  const channels = allowed.filter((c) => enabledByUser[c]);
  if (channels.length === 0) return null;

  const dedupeKey = input.dedupeKey === null ? null : (input.dedupeKey ?? `${input.type}:${input.groupKey ?? ""}`);
  if (def.quietMinutes && dedupeKey) {
    const since = new Date(now.getTime() - def.quietMinutes * 60_000);
    const recent = await client.notification.findFirst({ where: { userId, dedupeKey, createdAt: { gte: since } }, select: { id: true }, orderBy: { createdAt: "desc" } });
    if (recent) return { id: recent.id, created: false, channels: [] };
  }

  const notification = await client.notification.create({
    data: {
      userId,
      type: input.type,
      category,
      title,
      body,
      url: input.url ?? null,
      groupKey: input.groupKey ?? null,
      dedupeKey,
      data: (input.data ?? {}) as Prisma.InputJsonValue,
      deliveries: {
        create: channels.map((channel) => ({
          channel,
          status: channel === "IN_APP" ? ("SENT" as const) : ("PENDING" as const),
          sentAt: channel === "IN_APP" ? now : null,
          attempts: channel === "IN_APP" ? 1 : 0,
        })),
      },
    },
    select: { id: true },
  });
  // Outbound channels are handed to their worker outside any caller transaction, so a slow provider never
  // holds a database transaction open. With no provider registered they simply stay PENDING.
  if (!opts.tx && opts.dispatch !== false) void dispatchNotification(notification.id).catch((e) => console.error("[notify] dispatch failed", e));
  return { id: notification.id, created: true, channels };
}

export async function notifyMany(userIds: string[], input: NotifyInput, opts: NotifyOptions = {}): Promise<number> {
  const unique = [...new Set(userIds)].filter(Boolean);
  const results = await Promise.all(unique.map((id) => notify(id, input, opts).catch((e) => (console.error("[notify] failed", e), null))));
  return results.filter((r) => r?.created).length;
}

/* ------------------------------------------------------------------ Delivery */

/** Pushes every PENDING delivery of one notification to its channel sender. */
export async function dispatchNotification(notificationId: string): Promise<void> {
  const n = await db.notification.findUnique({
    where: { id: notificationId },
    select: { id: true, title: true, body: true, url: true, data: true, userId: true, user: { select: { email: true, phone: true, name: true } }, deliveries: { where: { status: "PENDING" }, select: { id: true, channel: true, attempts: true } } },
  });
  if (!n) return;
  for (const d of n.deliveries) {
    const sender = senders.get(d.channel);
    if (!sender) continue; // No provider yet: it waits, and a worker can pick it up later.
    // Claim the row first. Only the writer that moves it out of PENDING may call the provider, so the
    // inline dispatch and a cron pass running at the same time cannot send the same message twice.
    const claim = await db.notificationDelivery.updateMany({ where: { id: d.id, status: "PENDING" }, data: { status: "SENDING", attempts: { increment: 1 } } });
    if (claim.count === 0) continue;
    try {
      const res = await sender({ notificationId: n.id, userId: n.userId, email: n.user.email, phone: n.user.phone, name: n.user.name, title: n.title, body: n.body, url: n.url, data: n.data });
      await db.notificationDelivery.update({ where: { id: d.id }, data: { status: "SENT", sentAt: new Date(), provider: res.provider, providerRef: res.providerRef, error: null } });
    } catch (e) {
      await db.notificationDelivery.update({ where: { id: d.id }, data: { status: "FAILED", failedAt: new Date(), error: String(e instanceof Error ? e.message : e).slice(0, 500) } });
    }
  }
}

/** A claim that never finished (a crash mid-send) is retried after this long. */
const STUCK_CLAIM_MS = 10 * 60_000;

/** Retries pending deliveries across the backlog; the entry point a cron or queue worker would call. */
export async function dispatchPendingDeliveries(limit = 200): Promise<{ attempted: number }> {
  const live = [...senders.keys()];
  if (live.length === 0) return { attempted: 0 };
  // FAILED rows are left alone: a provider that rejected the message needs a human, not a louder retry.
  await db.notificationDelivery.updateMany({ where: { status: "SENDING", channel: { in: live }, createdAt: { lt: new Date(Date.now() - STUCK_CLAIM_MS) } }, data: { status: "PENDING" } });
  const pending = await db.notificationDelivery.findMany({ where: { status: "PENDING", channel: { in: live }, attempts: { lt: 5 } }, select: { notificationId: true }, take: limit, orderBy: { createdAt: "asc" } });
  const ids = [...new Set(pending.map((p) => p.notificationId))];
  for (const id of ids) await dispatchNotification(id);
  return { attempted: ids.length };
}

/* ------------------------------------------------------------------ Reading */

export const notificationSelect = {
  id: true,
  type: true,
  category: true,
  title: true,
  body: true,
  url: true,
  groupKey: true,
  readAt: true,
  createdAt: true,
  deliveries: { select: { channel: true, status: true, sentAt: true, failedAt: true, error: true } },
} satisfies Prisma.NotificationSelect;
export type NotificationView = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>;

/** A single row in the centre: one notification, or several collapsed under a shared groupKey. */
export type NotificationGroup = { key: string; latest: NotificationView; count: number; unread: number; ids: string[] };

function groupNotifications(rows: NotificationView[]): NotificationGroup[] {
  const out: NotificationGroup[] = [];
  const index = new Map<string, NotificationGroup>();
  for (const n of rows) {
    const groupable = defFor(n.type)?.groupable && n.groupKey;
    const key = groupable ? `${n.type}:${n.groupKey}` : n.id;
    const existing = groupable ? index.get(key) : undefined;
    if (existing) {
      existing.count++;
      existing.ids.push(n.id);
      if (!n.readAt) existing.unread++;
      continue;
    }
    const group: NotificationGroup = { key, latest: n, count: 1, unread: n.readAt ? 0 : 1, ids: [n.id] };
    if (groupable) index.set(key, group);
    out.push(group);
  }
  return out;
}

export async function listMyNotifications(actor: Actor | null, opts: { take?: number; category?: NotificationCategory; unreadOnly?: boolean } = {}) {
  const a = await requireActor(actor);
  const where: Prisma.NotificationWhereInput = {
    userId: a.id,
    deliveries: { some: { channel: "IN_APP" } },
    ...(opts.category ? { category: opts.category } : {}),
    ...(opts.unreadOnly ? { readAt: null } : {}),
  };
  const [rows, unread] = await Promise.all([
    db.notification.findMany({ where, select: notificationSelect, orderBy: { createdAt: "desc" }, take: opts.take ?? 60 }),
    db.notification.count({ where: { userId: a.id, readAt: null, deliveries: { some: { channel: "IN_APP" } } } }),
  ]);
  return { items: rows, groups: groupNotifications(rows), unread };
}

export async function countUnread(actor: Actor | null): Promise<number> {
  const a = await requireActor(actor);
  return db.notification.count({ where: { userId: a.id, readAt: null, deliveries: { some: { channel: "IN_APP" } } } });
}

/** Marks one notification read, or every notification collapsed under it when a group is tapped. */
export async function markNotificationRead(actor: Actor | null, notificationId: string) {
  const a = await requireActor(actor);
  const target = await db.notification.findFirst({ where: { id: notificationId, userId: a.id }, select: { id: true, type: true, groupKey: true } });
  if (!target) throw notFound("Notification");
  const groupable = defFor(target.type)?.groupable && target.groupKey;
  const res = await db.notification.updateMany({
    where: groupable ? { userId: a.id, type: target.type, groupKey: target.groupKey, readAt: null } : { id: target.id, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: res.count };
}

export async function markAllNotificationsRead(actor: Actor | null, category?: NotificationCategory) {
  const a = await requireActor(actor);
  const res = await db.notification.updateMany({ where: { userId: a.id, readAt: null, ...(category ? { category } : {}) }, data: { readAt: new Date() } });
  return { updated: res.count };
}

/* ------------------------------------------------------------------ Staff-initiated */

/** Staff message to one player at one of their locations. Kept from the earlier phases. */
export async function sendNotification(actor: Actor | null, userId: string, locationId: string, input: { title: string; body: string }) {
  const a = await requirePermission(actor, "notification.send", { locationId });
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw notFound("User");
  const res = await notify(userId, { type: "academy.announcement", data: { title: input.title, body: input.body }, url: "/app/notifications", dedupeKey: null });
  await audit({ actorId: a.id, action: "notification.sent", entityType: "Notification", entityId: res?.id ?? null, locationId, metadata: { userId, title: input.title } });
  return res;
}

/**
 * Academy announcement to many people at once. Scoped to the locations the sender may act on, so a location
 * manager cannot message the whole academy.
 */
export async function broadcastAnnouncement(actor: Actor | null, input: unknown): Promise<{ sent: number; recipients: number }> {
  const a = await requireActor(actor);
  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) throw validation("Check the highlighted fields.", fieldErrors(parsed.error));
  const { title, body, locationId, audience } = parsed.data;
  if (locationId) await requirePermission(a, "announcement.send", { locationId });
  else {
    const scope = await accessibleLocationIds(a, "announcement.send");
    if (scope !== "all") throw forbidden("Choose a club: only academy-wide roles can message everyone.");
  }
  const scope = await accessibleLocationIds(a, "announcement.send");
  const locationFilter = locationId ? [locationId] : scope === "all" ? null : scope;

  const where: Prisma.UserWhereInput = { status: "ACTIVE", id: { not: a.id } };
  const clauses: Prisma.UserWhereInput[] = [];
  if (audience !== "STAFF") clauses.push({ playerProfile: locationFilter ? { homeLocationId: { in: locationFilter } } : { isNot: null } });
  if (audience !== "PLAYERS") clauses.push({ memberships: { some: { status: "ACTIVE", ...(locationFilter ? { locationId: { in: locationFilter } } : {}) } } });
  where.OR = clauses;

  const recipients = await db.user.findMany({ where, select: { id: true } });
  const sent = await notifyMany(recipients.map((r) => r.id), { type: "academy.announcement", data: { title, body }, url: "/app/notifications", dedupeKey: null });
  await audit({ actorId: a.id, action: "announcement.sent", entityType: "Notification", locationId: locationId ?? null, metadata: { title, audience, recipients: recipients.length, sent } });
  return { sent, recipients: recipients.length };
}

/** Delivery health for the admin screen: how many of each channel are waiting, sent or failed. */
export async function deliveryStats(actor: Actor | null) {
  await requirePermission(actor, "notification.configure");
  const rows = await db.notificationDelivery.groupBy({ by: ["channel", "status"], _count: { _all: true } });
  return rows.map((r) => ({ channel: r.channel, status: r.status, count: r._count._all, live: channelIsLive(r.channel) }));
}

export { CATEGORY_LABEL };
export type { NotificationCategory };
