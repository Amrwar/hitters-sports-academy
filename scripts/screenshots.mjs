/**
 * Captures proposal screenshots with headless Chrome against a running server.
 *   node scripts/screenshots.mjs [baseUrl]
 * Requires the seeded dev database (npm run db:seed). Output: docs/screenshots/*.png + manifest.json.
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] ?? process.env.SHOT_BASE_URL ?? "http://localhost:3077";
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PASSWORD = process.env.SHOT_PASSWORD ?? "HittersDev!2026"; // seeded development password (prisma/seed.ts)
const OUT = path.resolve("docs/screenshots");
fs.mkdirSync(OUT, { recursive: true });

const manifest = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name, caption, opts = {}) {
  await page.evaluate(() => document.fonts?.ready);
  await sleep(opts.settle ?? 600);
  const file = path.join(OUT, `${name}.png`);
  // A fixed bottom bar would be painted mid-page in a full-page capture; hide it for the shot.
  if (opts.fullPage) await page.evaluate(() => document.querySelectorAll('nav[aria-label="Primary"]').forEach((n) => (n.style.display = "none")));
  await page.screenshot({ path: file, fullPage: opts.fullPage ?? false });
  if (opts.fullPage) await page.evaluate(() => document.querySelectorAll('nav[aria-label="Primary"]').forEach((n) => (n.style.display = "")));
  manifest.push({ name, caption, file: `docs/screenshots/${name}.png`, viewport: opts.viewport });
  console.log("captured", name);
}

async function go(page, url) {
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle2", timeout: 90_000 });
  await sleep(400);
}

async function login(page, email) {
  await go(page, "/login");
  await page.waitForSelector("input[name=email]", { timeout: 60_000 });
  await page.type("input[name=email]", email);
  await page.type("input[name=password]", PASSWORD);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 90_000 }), page.click("button[type=submit]")]);
  await sleep(2500); // splash redirects to /app
}

async function logout(page) {
  await go(page, "/app/profile?tab=settings");
  await page.evaluate(() => document.querySelector("form[action] button[type=submit]")?.closest("form")?.requestSubmit());
  await sleep(2500);
}

// Each run books a slot for the demo player; drop earlier script-made bookings so the player's booking limit is never hit.
{
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const amr = await prisma.user.findUnique({ where: { email: "amr@example.com" }, select: { id: true } });
  if (amr) {
    const gone = await prisma.booking.deleteMany({ where: { playerId: amr.id, confirmationCode: { not: { startsWith: "HT-SEED" } }, startsAt: { gt: new Date() } } });
    // Each run books a court and each booking leaves a notification, so the centre fills with repeats.
    // Clear the ones earlier runs made; this run's own booking puts a fresh one back.
    const stale = await prisma.notification.deleteMany({
      where: { userId: amr.id, OR: [{ type: "booking.confirmed" }, { groupKey: null, type: { startsWith: "game." } }] },
    });
    console.log(`cleanup: removed ${gone.count} script bookings and ${stale.count} stale notifications`);
  }
  await prisma.$disconnect();
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] });

try {
  /* ------------------------------------------------ Marketing + auth (desktop) */
  let page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
  await go(page, "/");
  await shot(page, "marketing-landing", "Marketing landing page: hero with the HITTERS lockup and the 3D monogram, locations, matchmaking, academy and membership sections.", { fullPage: true, viewport: "desktop" });
  await go(page, "/login");
  await shot(page, "auth-login", "Sign-in screen with the brand panel.", { viewport: "desktop" });
  await go(page, "/register");
  await shot(page, "auth-register", "Account creation.", { viewport: "desktop" });
  await go(page, "/design-system");
  await shot(page, "design-system", "Living style guide: brand marks, colour tokens, typography, buttons, forms, cards, feedback, data and states.", { fullPage: true, viewport: "desktop" });
  await page.close();

  /* ------------------------------------------------ Player app (phone) */
  page = await browser.newPage();
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await login(page, "amr@example.com");
  await go(page, "/app");
  await shot(page, "player-home", "Player home: official level, next booking, quick actions, live and open sessions.", { viewport: "phone" });
  await go(page, "/app/locations");
  await shot(page, "player-locations", "Clubs with live photos, open courts, today's hours and starting price.", { viewport: "phone" });
  await go(page, "/app/locations/new-cairo");
  await shot(page, "player-location-detail", "Club page: photos, description, hours, facilities, courts with today's availability, pricing rules.", { viewport: "phone" });

  // Booking flow
  await go(page, "/app/book");
  await page.waitForSelector('button[aria-label$=" available"]', { timeout: 60_000 });
  await shot(page, "player-book-grid", "Book a court: club, date strip and the live court-by-hour grid with prices.", { viewport: "phone" });
  const slots = await page.$$('button[aria-label$=" available"]');
  await slots[Math.min(4, slots.length - 1)].click();
  await page.waitForFunction(() => /EGP\s[\d,]+/.test(document.body.innerText) && !document.body.innerText.includes("No slot selected"), { timeout: 30_000 });
  await shot(page, "player-book-review", "Slot selected: duration chips and the price review bar with the pricing-rule breakdown.", { viewport: "phone" });
  const reviewBtn = await page.$$eval("button", (bs) => bs.findIndex((b) => b.textContent.trim() === "Review"));
  const buttons = await page.$$("button");
  await buttons[reviewBtn].click();
  await page.waitForSelector("[role=dialog]", { timeout: 20_000 });
  await shot(page, "player-book-confirm", "Confirmation dialog with the total, venue payment note and cancellation policy.", { viewport: "phone" });
  const confirmIdx = await page.$$eval("[role=dialog] button", (bs) => bs.findIndex((b) => b.textContent.startsWith("Confirm")));
  const dialogButtons = await page.$$("[role=dialog] button");
  await dialogButtons[confirmIdx].click();
  await page.waitForFunction(() => document.body.innerText.includes("Court booked"), { timeout: 30_000 });
  await shot(page, "player-book-done", "Booking confirmed with the confirmation code.", { viewport: "phone" });
  const detailHref = await page.$eval('a[href^="/app/bookings/"]', (a) => a.getAttribute("href"));
  await go(page, detailHref);
  await shot(page, "player-booking-detail", "Booking detail: time, court, directions, reschedule, payment status, players, cancellation window.", { viewport: "phone" });
  await go(page, "/app/bookings");
  await shot(page, "player-bookings", "My bookings: upcoming and history.", { viewport: "phone" });

  await go(page, "/app/profile");
  await shot(page, "player-profile", "Profile overview: official level, preferences, clubs.", { viewport: "phone" });
  await go(page, "/app/profile?tab=assessment");
  await shot(page, "player-profile-level", "Level tab: official level with description, request an assessment, level guide and history.", { viewport: "phone" });
  await go(page, "/app/profile?tab=history");
  await shot(page, "player-profile-history", "History tab: bookings, matches and training.", { viewport: "phone" });
  await go(page, "/app/profile?tab=settings");
  await shot(page, "player-profile-settings", "Settings: photo, identity, playing preferences, preferred times and clubs, password.", { viewport: "phone", fullPage: true });
  await go(page, "/app/notifications");
  await shot(page, "player-notifications", "Notification centre: category filters, unread first, grouped rows, mark all read.", { viewport: "phone", fullPage: true });
  await go(page, "/app/notifications?c=MATCHMAKING");
  await shot(page, "player-notifications-filter", "Filtered to games and matchmaking: invitations, join requests and lineup changes only.", { viewport: "phone" });
  await go(page, "/app/notifications/preferences");
  await shot(page, "player-notification-preferences", "Notification preferences: every category against every channel, with email, push and SMS marked as awaiting a provider.", { viewport: "phone", fullPage: true });

  await go(page, "/app/play");
  await shot(page, "player-play", "Play, For you: ranked matches for my level with the reasons, Find a match, my pairs.", { viewport: "phone", fullPage: true });
  await go(page, "/app/play?tab=games");
  await shot(page, "player-play-games", "Play, My games: invitations with one-tap accept or decline, then upcoming games.", { viewport: "phone" });
  await go(page, "/app/play?tab=requests");
  await shot(page, "player-play-requests", "Play, Requests: players asking to join my games with level and reasons; games I asked to join.", { viewport: "phone", fullPage: true });
  await go(page, "/app/play/find");
  await page.waitForFunction(() => /match(es)?$/m.test(document.body.innerText) || document.body.innerText.includes("No open games fit"), { timeout: 60_000 }).catch(() => undefined);
  await shot(page, "player-play-find", "Find a match: day, time window, clubs, solo or pair; every result explains why it matches.", { viewport: "phone", fullPage: true });
  await go(page, "/app/play/GM-SEED06");
  await shot(page, "player-game-requests", "Organizer review: who is asking, official level, spots needed, compatibility now, history, accept or decline.", { viewport: "phone", fullPage: true });
  await go(page, "/app/play/GM-SEED03");
  await shot(page, "player-game-ask", "Game page for a compatible player: match reasons and Request to join; the organizer decides.", { viewport: "phone", fullPage: true });
  await go(page, "/app/play/pairs");
  await shot(page, "player-pairs", "Pairs: propose a partner, confirm, request two spots together or take a challenge.", { viewport: "phone" });
  await go(page, "/app/play/GM-SEED01");
  await shot(page, "player-game-invite", "Game as an invited player: lineup, spots, levels, cost, accept or decline.", { viewport: "phone", fullPage: true });
  await go(page, "/app/play/GM-SEED02");
  await shot(page, "player-game-organizer", "Game as the organizer: publish, invite, discoverable and open-spots switches, edit, cancel.", { viewport: "phone", fullPage: true });
  await go(page, "/app/play/new");
  await shot(page, "player-game-new", "Organize a game: pick a booking, format, levels, invitations, visibility and cost.", { viewport: "phone", fullPage: true });
  await go(page, "/app/programs");
  await shot(page, "player-programs", "Academy: private coaching and packages, my programs, open programs for my level.", { viewport: "phone", fullPage: true });
  await go(page, "/app/programs/PR-SEED01");
  await shot(page, "player-program-detail", "Program: dates, schedule, group size, rules, coach, every session with my attendance, enroll or waitlist.", { viewport: "phone", fullPage: true });
  await go(page, "/app/trainers");
  await shot(page, "player-trainers", "Coaches filtered by club and level, with specialties and hourly rate.", { viewport: "phone" });
  const trainerHref = await page.$eval('a[href^="/app/trainers/"]', (a) => a.getAttribute("href"));
  await go(page, trainerHref);
  await page.waitForFunction(() => /\d\d:\d\d/.test(document.body.innerText) || document.body.innerText.includes("No free times"), { timeout: 30_000 }).catch(() => undefined);
  await shot(page, "player-trainer-detail", "Coach profile: bio, qualifications, languages, levels, availability picker and lesson booking with package credits.", { viewport: "phone", fullPage: true });
  await go(page, "/app/lessons");
  await shot(page, "player-lessons", "My lessons: upcoming and history.", { viewport: "phone" });
  const lessonHref = await page.$eval('a[href^="/app/lessons/"]', (a) => a.getAttribute("href")).catch(() => null);
  if (lessonHref) {
    await go(page, lessonHref);
    await shot(page, "player-lesson-detail", "Lesson: time, coach, price or credit, free-change window, reschedule and cancel, shared coach notes.", { viewport: "phone", fullPage: true });
  }
  await go(page, "/app/packages");
  await shot(page, "player-packages", "Packages: credits left, expiry, catalogue, lesson history.", { viewport: "phone", fullPage: true });
  await logout(page);
  await page.close();

  /* ------------------------------------------------ Messaging, as a player who is in a lineup (phone, fresh session) */
  const omarContext = await browser.createBrowserContext();
  page = await omarContext.newPage();
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await login(page, "omar@example.com");
  await go(page, "/app/messages");
  await shot(page, "player-messages", "Messages: one conversation per game and per program, newest activity first.", { viewport: "phone" });
  await go(page, "/app/play/GM-SEED01");
  await page.waitForSelector("#chat", { timeout: 30_000 }).catch(() => undefined);
  await page.evaluate(() => document.querySelector("#chat")?.scrollIntoView({ block: "start" }));
  await sleep(600);
  await shot(page, "player-game-chat", "Group chat for a game: the lineup by name, photo and level, the conversation, and a report control on anyone else's message. No phone number or email is ever shown.", { viewport: "phone" });
  await page.close();

  /* ------------------------------------------------ Admin (desktop) */
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
  await login(page, "admin@hitters.academy");
  await go(page, "/admin");
  await shot(page, "admin-dashboard", "Admin dashboard: today's bookings, occupancy by hour, revenue, members.", { fullPage: true, viewport: "desktop" });
  await go(page, "/admin/bookings?all=1");
  await shot(page, "admin-bookings", "Bookings: filters, status, payment, row actions, manual booking.", { viewport: "desktop" });
  await go(page, "/admin/calendar");
  await shot(page, "admin-calendar", "Court calendar: courts by hour with prices, booked cells and block actions.", { viewport: "desktop" });
  await go(page, "/admin/courts");
  await shot(page, "admin-courts", "Courts per location with status, template summary and maintenance toggle.", { viewport: "desktop" });
  const courtHref = await page.$eval('a[href^="/admin/courts/"]', (a) => a.getAttribute("href"));
  await go(page, courtHref);
  await shot(page, "admin-court-detail", "Court page: details, weekly operating hours with base rate, closures.", { fullPage: true, viewport: "desktop" });
  await go(page, "/admin/locations");
  await shot(page, "admin-locations", "Locations overview.", { viewport: "desktop" });
  const locHref = await page.$eval('a[href^="/admin/locations/"]', (a) => a.getAttribute("href"));
  await go(page, locHref);
  await shot(page, "admin-location-editor", "Location editor: details, photos, opening hours, facilities, booking policy, pricing.", { viewport: "desktop" });
  await go(page, `${locHref}?tab=pricing`);
  await page.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((t) => t.textContent.includes("Pricing"))?.click());
  await sleep(800);
  await shot(page, "admin-location-pricing", "Pricing rules: peak, weekend and membership adjustments layered over the base rate.", { viewport: "desktop" });
  await go(page, "/admin/members");
  await shot(page, "admin-members", "Members in scope with level, home club, roles and status.", { viewport: "desktop" });
  const memberHref = await page.evaluate(() => { const row = [...document.querySelectorAll("tbody tr")].find((r) => r.textContent.includes("Amr Hefny")); return null; });
  void memberHref;
  await go(page, "/admin/assessments");
  await shot(page, "admin-assessments", "Assessment queue: requests waiting, scheduled sessions, record results.", { viewport: "desktop" });
  await page.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((t) => t.textContent.includes("Level definitions"))?.click());
  await sleep(800);
  await shot(page, "admin-levels", "Configurable level definitions: rank, label and description.", { viewport: "desktop" });
  await go(page, "/admin/staff");
  await shot(page, "admin-staff", "Staff roles per location with grant and revoke.", { viewport: "desktop" });
  await go(page, "/admin/games");
  await shot(page, "admin-games", "Games across the staff member's locations: lineup, levels, cost, status, cancel.", { viewport: "desktop" });
  await go(page, "/admin/settings");
  await shot(page, "admin-settings", "Academy settings: matchmaking rules (adjacent levels, request expiry, open-request cap) and the scoring table.", { viewport: "desktop" });
  await go(page, "/admin/trainers");
  await shot(page, "admin-trainers", "Trainer profiles: clubs, levels, specialties, rate, booking mode, status.", { viewport: "desktop" });
  await go(page, "/admin/programs");
  const programId = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Roster"); b?.click(); return true; });
  void programId;
  await sleep(1500);
  await shot(page, "admin-programs", "Programs: schedule, enrollment progress, status, roster with waitlist, attendance and payments.", { viewport: "desktop", fullPage: true });
  await go(page, "/admin/packages");
  await shot(page, "admin-packages", "Packages: catalogue and member purchases with credits, expiry and payments.", { viewport: "desktop" });
  await go(page, "/admin/notifications");
  await shot(page, "admin-notification-templates", "Notification templates by category: editable title and body, live preview, the placeholders each type can fill, channels and an on/off switch.", { viewport: "desktop", fullPage: true });
  await page.evaluate(() => [...document.querySelectorAll("[role=tab], button")].find((t) => t.textContent.trim() === "Announcement")?.click());
  await sleep(900);
  await shot(page, "admin-announcement", "Academy announcement: title, message, club and audience, with a preview of the notification players will see.", { viewport: "desktop" });
  await page.evaluate(() => [...document.querySelectorAll("[role=tab], button")].find((t) => t.textContent.trim() === "Delivery")?.click());
  await sleep(900);
  await shot(page, "admin-notification-delivery", "Delivery health per channel: in-app sent immediately, email, push and SMS queued until a provider is registered.", { viewport: "desktop" });
  await go(page, "/admin/moderation");
  await shot(page, "admin-moderation", "Moderation queue: a reported message with the reason, the original text, and remove, action, dismiss or lock the conversation.", { viewport: "desktop", fullPage: true });
  await page.close();

  /* ------------------------------------------------------------------ Trainer workspace (desktop, fresh session) */
  const coachContext = await browser.createBrowserContext();
  page = await coachContext.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
  await login(page, "coach.ahmed@hitters.academy");
  await go(page, "/admin/coaching");
  await shot(page, "admin-coaching", "Trainer workspace: upcoming lessons and requests with accept, attendance and notes.", { viewport: "desktop" });
  await go(page, "/admin/coaching?tab=availability");
  await shot(page, "admin-coaching-availability", "Weekly coaching hours per club, auto-confirm switch and time off.", { viewport: "desktop" });
  await go(page, "/admin/coaching?tab=students");
  await shot(page, "admin-coaching-students", "Assigned students with lessons, last and next session, programs and progress notes.", { viewport: "desktop" });
  await page.close();
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`done: ${manifest.length} screenshots in ${OUT}`);
