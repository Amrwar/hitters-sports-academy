import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "hitters_session";

/**
 * Edge gate: redirects signed-out visitors away from the app and admin areas.
 * This is UX only. Every page and server action re-validates the session and permissions.
 */
export function middleware(req: NextRequest) {
  const hasSession = !!req.cookies.get(SESSION_COOKIE)?.value;
  const { pathname, search } = req.nextUrl;
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*", "/splash"],
};
