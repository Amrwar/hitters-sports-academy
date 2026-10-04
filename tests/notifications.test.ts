import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { NOTIFICATION_CATALOG, NOTIFICATION_TYPES, render } from "@/lib/notifications";
import * as notifications from "@/server/services/notifications";
import * as messaging from "@/server/services/messaging";
import * as bookings from "@/server/services/bookings";
import * as courts from "@/server/services/courts";
import * as games from "@/server/services/game-sessions";
import { sendDueReminders } from "@/server/services/reminders";
import { expectCode, makeLocation, makeUser } from "./helpers";

const NOW = new Date("2026-11-09T08:00:00Z"); // Monday 10:00 Cairo
const DAY = "2026-11-10";
const ALL_WEEK = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, opensAt: 7 * 60, closesAt: 24 * 60, slotMinutes: 60, priceCents: 40000 }));

async function world() {
  const A = await makeLocation("notify-a");
  const B = await makeLocation("notify-b");
  const owner = await makeUser({ globalRole: "ACADEMY_OWNER", name: "Owner Olivia" });
  const managerA = await makeUser({ staff: [{ locationId: A.id, role: "LOCATION_MANAGER" }], name: "Manager Mo" });
  const receptionA = await makeUser({ staff: [{ locationId: A.id, role: "RECEPTIONIST" }], name: "Desk Dina" });
  const org = await makeUser({ homeLocationId: A.id, name: "Omar Organizer", level: "B" });
  const p1 = await makeUser({ homeLocationId: A.id, name: "Laila Player", level: "B" });
  const p2 = await makeUser({ homeLocationId: B.id, name: "Karim Player", level: "B" });
  const c1 = await courts.createCourt(managerA.actor, { locationId: A.id, name: "Court 1", type: "INDOOR" });
  await courts.setCourtAvailability(managerA.actor, c1.id, ALL_WEEK);
  return { A, B, owner, managerA, receptionA, org, p1, p2, c1 };
}
type World = Awaited<ReturnType<typeof world>>;

const unreadOf = async (userId: string) => db.notification.count({ where: { userId, readAt: null } });

/** A published game with the organizer plus one accepted player: the smallest thing with a real lineup. */
async function gameWithLineup(w: World) {
  const booking = await bookings.createBooking(w.org.actor, { courtId: w.c1.id, dateISO: DAY, startMinutes: 19 * 60, durationMinutes: 90 }, { now: NOW });
  const g = await games.createGameSession(w.org.actor, { bookingId: booking.id, inviteUserIds: [w.p1.user.id] }, { now: NOW });
  await games.publishGame(w.org.actor, g.id, { now: NOW });
  await games.respondToInvite(w.p1.actor, g.id, "ACCEPT", { now: NOW });
  return { booking, game: await games.getGameSession(w.org.actor, g.id) };
}

describe("the notification catalogue", () => {
  it("renders every type without leaving a placeholder behind", () => {
    for (const type of NOTIFICATION_TYPES) {
      const def = NOTIFICATION_CATALOG[type];
      const sample = Object.fromEntries(def.vars.map((v) => [v, `v-${v}`]));
      expect(render(def.title, sample)).not.toMatch(/\{\{/);
      expect(render(def.body, sample)).not.toMatch(/\{\{/);
      expect(def.channels.length).toBeGreaterThan(0);
    }
  });

  it("collapses a placeholder with no value instead of showing braces or stray separators", () => {
    expect(render("{{a}} · {{b}}", { a: "One" })).toBe("One");
    expect(render("{{club}}.{{reasonSuffix}}", { club: "HITTERS" })).toBe("HITTERS.");
    expect(render("{{spots}} spot{{spotsPlural}} open", { spots: 1, spotsPlural: "" })).toBe("1 spot open");
  });
});

describe("creating notifications", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("writes one delivery row per channel, marks in-app sent and leaves email pending until a provider exists", async () => {
    const res = await notifications.notify(w.p1.user.id, { type: "booking.confirmed", data: { code: "HT-1", club: "HITTERS", court: "Court 1", when: "Sat 19:00", duration: 90 } });
    expect(res?.created).toBe(true);
    expect(res?.channels).toEqual(["IN_APP", "EMAIL"]);
    const rows = await db.notificationDelivery.findMany({ where: { notificationId: res!.id }, orderBy: { channel: "asc" } });
    expect(rows).toHaveLength(2);
    const inApp = rows.find((r) => r.channel === "IN_APP")!;
    expect(inApp.status).toBe("SENT");
    expect(inApp.sentAt).not.toBeNull();
    expect(inApp.attempts).toBe(1);
    const email = rows.find((r) => r.channel === "EMAIL")!;
    expect(email.status).toBe("PENDING");
    expect(email.sentAt).toBeNull();
    expect(email.attempts).toBe(0);
  });

  it("renders the admin template instead of the default, and sends nothing when the type is disabled", async () => {
    await notifications.seedNotificationTemplates();
    await notifications.updateTemplate(w.owner.actor, "booking.confirmed", { title: "Court locked in: {{code}}", body: "{{club}} at {{when}}.", enabled: true, channels: ["IN_APP"] });
    const res = await notifications.notify(w.p1.user.id, { type: "booking.confirmed", data: { code: "HT-2", club: "HITTERS", when: "Sat 19:00" } });
    const row = await db.notification.findUniqueOrThrow({ where: { id: res!.id } });
    expect(row.title).toBe("Court locked in: HT-2");
    expect(row.body).toBe("HITTERS at Sat 19:00.");
    expect(await db.notificationDelivery.count({ where: { notificationId: row.id } })).toBe(1);

    await notifications.updateTemplate(w.owner.actor, "booking.confirmed", { title: "Paused", body: "Not sent.", enabled: false, channels: ["IN_APP"] });
    expect(await notifications.notify(w.p1.user.id, { type: "booking.confirmed", data: { code: "HT-3" } })).toBeNull();
  });

  it("refuses a template placeholder the type cannot fill, and resets back to the HITTERS default", async () => {
    await notifications.seedNotificationTemplates();
    await expectCode(notifications.updateTemplate(w.owner.actor, "booking.confirmed", { title: "Hi {{nonsense}}", body: "b", enabled: true, channels: ["IN_APP"] }), "VALIDATION");
    await notifications.updateTemplate(w.owner.actor, "booking.confirmed", { title: "Changed", body: "Body", enabled: true, channels: ["IN_APP"] });
    const reset = await notifications.resetTemplate(w.owner.actor, "booking.confirmed");
    expect(reset.title).toContain("{{code}}");
    await expectCode(notifications.updateTemplate(w.p1.actor, "booking.confirmed", { title: "Mine now", body: "Hello", enabled: true, channels: ["IN_APP"] }), "FORBIDDEN");
    await expectCode(notifications.listTemplates(w.receptionA.actor), "FORBIDDEN");
  });

  it("respects a muted channel and sends nothing when every channel for the category is off", async () => {
    await notifications.updateMyPreferences(w.p1.actor, {
      rows: [
        { category: "BOOKING", inApp: true, email: false, push: false, sms: false },
        { category: "MATCHMAKING", inApp: false, email: false, push: false, sms: false },
      ],
    });
    const booking = await notifications.notify(w.p1.user.id, { type: "booking.confirmed", data: { code: "HT-4", club: "HITTERS" } });
    expect(booking?.channels).toEqual(["IN_APP"]);
    expect(await notifications.notify(w.p1.user.id, { type: "game.invited", data: { organizer: "Omar", when: "Sat", club: "HITTERS" } })).toBeNull();
  });

  it("suppresses a repeat inside the quiet window and groups the ones that are meant to collapse", async () => {
    const first = await notifications.notify(w.org.user.id, { type: "game.lineup", groupKey: "game-1", data: { player: "Laila", accepted: 2, max: 4, code: "GM-1" } });
    const second = await notifications.notify(w.org.user.id, { type: "game.lineup", groupKey: "game-1", data: { player: "Karim", accepted: 3, max: 4, code: "GM-1" } });
    expect(first?.created).toBe(true);
    expect(second?.created).toBe(false);
    expect(await db.notification.count({ where: { userId: w.org.user.id, type: "game.lineup" } })).toBe(1);

    // A different game is a different key, so it is not suppressed, and the two stay separate rows.
    const other = await notifications.notify(w.org.user.id, { type: "game.lineup", groupKey: "game-2", data: { player: "Nadia", accepted: 2, max: 4, code: "GM-2" } });
    expect(other?.created).toBe(true);
    const { groups } = await notifications.listMyNotifications(w.org.actor);
    expect(groups).toHaveLength(2);
  });

  it("collapses several notifications of one groupable type into a single row, and marks the whole group read at once", async () => {
    const at = (min: number) => new Date(NOW.getTime() + min * 60_000);
    for (let i = 0; i < 3; i++) {
      await notifications.notify(w.org.user.id, { type: "game.request", groupKey: "game-9", data: { who: `Player ${i}`, reasons: "Exact level", code: "GM-9" } }, { now: at(i * 60) });
    }
    const { groups, unread } = await notifications.listMyNotifications(w.org.actor);
    expect(unread).toBe(3);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
    const marked = await notifications.markNotificationRead(w.org.actor, groups[0].latest.id);
    expect(marked.updated).toBe(3);
    expect(await unreadOf(w.org.user.id)).toBe(0);
  });

  it("keeps notifications private and clears them per category", async () => {
    await notifications.notify(w.p1.user.id, { type: "booking.confirmed", data: { code: "HT-5", club: "HITTERS" } });
    await notifications.notify(w.p1.user.id, { type: "game.invited", data: { organizer: "Omar", when: "Sat", club: "HITTERS" } });
    await expectCode(notifications.listMyNotifications(null), "UNAUTHENTICATED");
    expect((await notifications.listMyNotifications(w.p2.actor)).unread).toBe(0);
    const cleared = await notifications.markAllNotificationsRead(w.p1.actor, "BOOKING");
    expect(cleared.updated).toBe(1);
    expect((await notifications.listMyNotifications(w.p1.actor, { category: "MATCHMAKING" })).unread).toBe(1);
  });

  it("drops an unknown type rather than writing something nobody can configure", async () => {
    expect(await notifications.notify(w.p1.user.id, { type: "not.a.real.type", data: {} })).toBeNull();
    expect(await db.notification.count({ where: { type: "not.a.real.type" } })).toBe(0);
  });
});

describe("delivery states", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("marks a delivery sent when its channel accepts it and failed when the provider throws", async () => {
    const seen: string[] = [];
    notifications.registerChannelSender("EMAIL", async (payload) => {
      seen.push(payload.title);
      return { provider: "test-mailer", providerRef: "msg-1" };
    });
    notifications.registerChannelSender("PUSH", async () => {
      throw new Error("device token expired");
    });
    try {
      const res = await notifications.notify(w.p1.user.id, { type: "booking.confirmed", data: { code: "HT-6", club: "HITTERS", court: "Court 1", when: "Sat 19:00", duration: 90 } }, { dispatch: false });
      await notifications.dispatchNotification(res!.id);
      const email = await db.notificationDelivery.findFirstOrThrow({ where: { notificationId: res!.id, channel: "EMAIL" } });
      expect(email.status).toBe("SENT");
      expect(email.provider).toBe("test-mailer");
      expect(email.providerRef).toBe("msg-1");
      expect(email.attempts).toBe(1);
      expect(seen).toHaveLength(1);

      // Push is live but failing: the row records the error and the attempt, and the rest still went out.
      // A channel has to be on the type as well as on the person, so the template is widened first.
      await notifications.seedNotificationTemplates();
      await notifications.updateTemplate(w.owner.actor, "booking.cancelled", { title: "Booking {{code}} cancelled", body: "{{club}}.", enabled: true, channels: ["IN_APP", "PUSH"] });
      await notifications.updateMyPreferences(w.p1.actor, { rows: [{ category: "BOOKING", inApp: true, email: false, push: true, sms: false }] });
      const pushed = await notifications.notify(w.p1.user.id, { type: "booking.cancelled", data: { code: "HT-7", club: "HITTERS", when: "Sat 19:00" } }, { dispatch: false });
      await notifications.dispatchNotification(pushed!.id);
      const push = await db.notificationDelivery.findFirstOrThrow({ where: { notificationId: pushed!.id, channel: "PUSH" } });
      expect(push.status).toBe("FAILED");
      expect(push.failedAt).not.toBeNull();
      expect(push.attempts).toBe(1);
      expect(push.error).toContain("device token expired");
    } finally {
      notifications.clearChannelSenders();
    }
  });

  it("reports delivery health per channel to an admin only", async () => {
    await notifications.notify(w.p1.user.id, { type: "booking.confirmed", data: { code: "HT-8", club: "HITTERS" } });
    const stats = await notifications.deliveryStats(w.owner.actor);
    const inApp = stats.find((s) => s.channel === "IN_APP" && s.status === "SENT");
    expect(inApp?.count).toBe(1);
    expect(inApp?.live).toBe(true);
    expect(stats.find((s) => s.channel === "EMAIL")?.status).toBe("PENDING");
    await expectCode(notifications.deliveryStats(w.p1.actor), "FORBIDDEN");
  });

  it("retries a pending backlog once a provider is registered, and leaves it alone while none is", async () => {
    // dispatch: false queues the email exactly as a channel with no provider would leave it.
    const res = await notifications.notify(w.p1.user.id, { type: "booking.confirmed", data: { code: "HT-9", club: "HITTERS" } }, { dispatch: false });
    expect(await notifications.dispatchPendingDeliveries()).toEqual({ attempted: 0 });
    expect((await db.notificationDelivery.findFirstOrThrow({ where: { notificationId: res!.id, channel: "EMAIL" } })).status).toBe("PENDING");

    notifications.registerChannelSender("EMAIL", async () => ({ provider: "test-mailer" }));
    try {
      expect((await notifications.dispatchPendingDeliveries()).attempted).toBe(1);
      const email = await db.notificationDelivery.findFirstOrThrow({ where: { notificationId: res!.id, channel: "EMAIL" } });
      expect(email.status).toBe("SENT");
      expect(email.attempts).toBe(1);
    } finally {
      notifications.clearChannelSenders();
    }
  });
});

describe("announcements and reminders", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("scopes an announcement to the sender's clubs and refuses an academy-wide one from a location manager", async () => {
    const scoped = await notifications.broadcastAnnouncement(w.managerA.actor, { title: "Courts closed", body: "Resurfacing until noon.", locationId: w.A.id });
    expect(scoped.sent).toBeGreaterThan(0);
    expect(await db.notification.count({ where: { userId: w.p2.user.id, type: "academy.announcement" } })).toBe(0);
    await expectCode(notifications.broadcastAnnouncement(w.managerA.actor, { title: "Everyone", body: "Hello all." }), "FORBIDDEN");
    await expectCode(notifications.broadcastAnnouncement(w.managerA.actor, { title: "Other club", body: "Hello.", locationId: w.B.id }), "FORBIDDEN");
    const wide = await notifications.broadcastAnnouncement(w.owner.actor, { title: "Academy news", body: "New club opening." });
    expect(wide.sent).toBeGreaterThanOrEqual(2);
  });

  it("reminds the player about a booking once, however often the job runs", async () => {
    await bookings.createBooking(w.p1.actor, { courtId: w.c1.id, dateISO: DAY, startMinutes: 19 * 60, durationMinutes: 90 }, { now: NOW });
    const soon = new Date("2026-11-10T08:00:00Z"); // same day, 10:00 Cairo, so 19:00 is inside the window
    const first = await sendDueReminders({ now: soon });
    expect(first.bookings).toBe(1);
    const second = await sendDueReminders({ now: new Date(soon.getTime() + 3_600_000) });
    expect(second.bookings).toBe(0);
    expect(await db.notification.count({ where: { userId: w.p1.user.id, type: "booking.reminder" } })).toBe(1);
  });

  it("warns the player holding a booking when staff close the court under it", async () => {
    const b = await bookings.createBooking(w.p1.actor, { courtId: w.c1.id, dateISO: DAY, startMinutes: 19 * 60, durationMinutes: 90 }, { now: NOW });
    await courts.addCourtClosure(w.managerA.actor, w.c1.id, { startsAt: new Date("2026-11-10T16:00:00Z"), endsAt: new Date("2026-11-10T20:00:00Z"), reason: "Lighting repair" });
    const row = await db.notification.findFirstOrThrow({ where: { userId: w.p1.user.id, type: "booking.court_unavailable" } });
    expect(row.title).toContain("Court 1");
    expect(row.body).toContain("Lighting repair");
    expect(row.url).toBe(`/app/bookings/${b.id}`);
  });
});

describe("group messaging", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("opens one thread for the lineup, notifies the others, and never exposes a contact detail", async () => {
    const { game } = await gameWithLineup(w);
    const message = await messaging.postMessage(w.org.actor, "GAME", game.id, { body: "I'll bring the balls." });
    expect(message.body).toBe("I'll bring the balls.");
    const view = await messaging.getThread(w.p1.actor, "GAME", game.id);
    expect(view.messages).toHaveLength(1);
    expect(view.canPost).toBe(true);
    expect(view.members.map((m) => m.name).sort()).toEqual(["Laila Player", "Omar Organizer"]);
    expect(JSON.stringify(view.members)).not.toContain("@example.com");
    expect(Object.keys(view.members[0]).sort()).toEqual(["id", "level", "name", "photoUrl", "role"]);
    expect(await db.notification.count({ where: { userId: w.p1.user.id, type: "message.new" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: w.org.user.id, type: "message.new" } })).toBe(0);
  });

  it("keeps outsiders out, and lets a moderator read without posting", async () => {
    const { game } = await gameWithLineup(w);
    await messaging.postMessage(w.org.actor, "GAME", game.id, { body: "See you there." });
    await expectCode(messaging.getThread(w.p2.actor, "GAME", game.id), "FORBIDDEN");
    await expectCode(messaging.postMessage(w.p2.actor, "GAME", game.id, { body: "Let me in" }), "FORBIDDEN");
    const asStaff = await messaging.getThread(w.managerA.actor, "GAME", game.id);
    expect(asStaff.messages).toHaveLength(1);
    expect(asStaff.canPost).toBe(false);
    expect(asStaff.readOnlyReason).toContain("moderator");
  });

  it("groups a busy thread into one notification inside the quiet window", async () => {
    const { game } = await gameWithLineup(w);
    await messaging.postMessage(w.org.actor, "GAME", game.id, { body: "One" });
    await messaging.postMessage(w.org.actor, "GAME", game.id, { body: "Two" });
    await messaging.postMessage(w.org.actor, "GAME", game.id, { body: "Three" });
    expect(await db.message.count()).toBe(3);
    expect(await db.notification.count({ where: { userId: w.p1.user.id, type: "message.new" } })).toBe(1);
  });

  it("lists the threads a player belongs to with their last message", async () => {
    const { game } = await gameWithLineup(w);
    await messaging.postMessage(w.p1.actor, "GAME", game.id, { body: "On my way." });
    const threads = await messaging.listMyThreads(w.p1.actor);
    expect(threads).toHaveLength(1);
    expect(threads[0].label).toBe(`Game ${game.code}`);
    expect(threads[0].lastBody).toBe("On my way.");
    expect(threads[0].lastSender).toBe("Laila");
    expect(await messaging.listMyThreads(w.p2.actor)).toHaveLength(0);
  });
});

describe("moderation", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("takes a report, tells the moderators, removes the message on a decision and tells the sender", async () => {
    const { game } = await gameWithLineup(w);
    const bad = await messaging.postMessage(w.org.actor, "GAME", game.id, { body: "Call me on 0100 000 0000 and we settle this." });
    await expectCode(messaging.reportMessage(w.org.actor, bad.id, { reason: "Spam or advertising" }), "VALIDATION");
    const { reportId } = await messaging.reportMessage(w.p1.actor, bad.id, { reason: "Personal information", note: "Posted a phone number." });
    expect(await db.notification.count({ where: { userId: w.managerA.user.id, type: "message.reported" } })).toBe(1);

    const open = await messaging.listReports(w.managerA.actor, { status: "OPEN" });
    expect(open).toHaveLength(1);
    expect(open[0].threadLabel).toBe(`Game ${game.code}`);
    await expectCode(messaging.listReports(w.p1.actor), "FORBIDDEN");

    const decided = await messaging.decideReport(w.managerA.actor, reportId, { decision: "ACTIONED", removeMessage: true, outcome: "Removed and warned." });
    expect(decided.removed).toBe(true);
    const row = await db.message.findUniqueOrThrow({ where: { id: bad.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.deletedById).toBe(w.managerA.user.id);
    expect(await db.notification.count({ where: { userId: w.org.user.id, type: "message.removed" } })).toBe(1);
    const after = await messaging.getThread(w.p1.actor, "GAME", game.id);
    expect(after.messages[0].deletedAt).not.toBeNull();
  });

  it("locks a conversation so it stays readable but nobody can post", async () => {
    const { game } = await gameWithLineup(w);
    await messaging.postMessage(w.org.actor, "GAME", game.id, { body: "Enough of this." });
    const thread = await db.messageThread.findFirstOrThrow({ where: { gameId: game.id } });
    await messaging.setThreadLock(w.managerA.actor, thread.id, true);
    await expectCode(messaging.postMessage(w.org.actor, "GAME", game.id, { body: "One more" }), "VALIDATION");
    const view = await messaging.getThread(w.org.actor, "GAME", game.id);
    expect(view.locked).toBe(true);
    expect(view.canPost).toBe(false);
    expect(view.messages).toHaveLength(1);
    await messaging.setThreadLock(w.managerA.actor, thread.id, false);
    expect((await messaging.getThread(w.org.actor, "GAME", game.id)).canPost).toBe(true);
    await expectCode(messaging.setThreadLock(w.p1.actor, thread.id, true), "FORBIDDEN");
  });
});
