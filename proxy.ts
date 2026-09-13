import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "sda_session";

// Paths that must stay reachable without a session cookie.
const PUBLIC_PATHS = ["/login", "/api/login", "/manifest.json", "/sw.js"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p) ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/_next/");

  // The GitHub Actions scraper authenticates with its own Bearer token
  // (checked inside the route handler), not the browser session cookie.
  const isInternalCronRoute = pathname.startsWith("/api/cron/");

  if (isPublic || isInternalCronRoute) {
    return NextResponse.next();
  }

  const expected = process.env.APP_SESSION_SECRET;
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;

  if (!expected || cookie !== expected) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
