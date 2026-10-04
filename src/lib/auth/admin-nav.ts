import type { Permission } from "./permissions";

/**
 * What each admin page needs before it is worth showing someone.
 *
 * One map, read by the sidebar (to decide what to render) and by the admin layout (to work out, on the
 * server where the permission matrix lives, which of those a given staff member may use). Keeping both
 * sides on the same map is the point: a nav that offers a page the person cannot open is how a coach ends
 * up on an error screen having clicked something the application put in front of them.
 *
 * An entry with several permissions means any one of them is enough. An href with no entry is open to
 * every staff member.
 */
export const ADMIN_NAV_PERMISSIONS: Record<string, readonly Permission[]> = {
  "/admin": ["booking.read"],
  "/admin/analytics": ["booking.read"],
  "/admin/bookings": ["booking.read"],
  "/admin/calendar": ["court.read"],
  "/admin/games": ["session.read"],
  // A coach reaches their own workspace through trainer.self; a manager reaches other people's through
  // trainer.manage. Both land on the same page and see different things.
  "/admin/coaching": ["trainer.self", "trainer.manage"],
  "/admin/courts": ["court.manage"],
  "/admin/locations": ["location.manage"],
  "/admin/finance": ["finance.read"],
  "/admin/finance/invoices": ["finance.read"],
  "/admin/memberships": ["finance.read"],
  "/admin/coupons": ["finance.read"],
  "/admin/notifications": ["notification.configure", "announcement.send"],
  "/admin/moderation": ["message.moderate"],
  "/admin/members": ["users.read"],
  "/admin/assessments": ["assessment.read"],
  "/admin/staff": ["staff.read"],
  "/admin/trainers": ["trainer.manage"],
  "/admin/programs": ["program.manage"],
  "/admin/packages": ["package.manage"],
};

export const ADMIN_NAV_HREFS = Object.keys(ADMIN_NAV_PERMISSIONS);
