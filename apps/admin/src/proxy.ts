import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Coarse, cheap gate at the edge — checks only that the session cookie is
// *present*, not that the token inside it is actually still valid (that
// would mean an API call from middleware on every request, which the Edge
// runtime makes awkward and which would add real latency to every
// navigation). Real validation happens once, server-side, in
// requireSession() (src/lib/session.ts) via a genuine call to GET
// /auth/me. This layer only exists so an unauthenticated visitor bounces
// to /login before any page even starts rendering, and a logged-in visitor
// doesn't land back on the login form.
const SESSION_COOKIE = "wf_session";
// Bounced away from if already logged in (no reason to show a login form
// to someone already signed in).
const PUBLIC_PATHS = ["/login", "/register"];
// Viewable regardless of auth state, logged in or not — design/marketing
// preview routes and the static assets they reference. Unlike PUBLIC_PATHS
// above, being logged in must never redirect a visitor away from these.
const ALWAYS_PUBLIC_PATHS = ["/welfare_login_bg.png"];

// The platform operator area is a structurally separate actor (see
// lib/platform-session.ts) with its own cookie — handled as its own
// branch entirely so a tenant admin's session cookie is never mistaken
// for a platform operator's, or vice versa.
const PLATFORM_SESSION_COOKIE = "wf_platform_session";
const PLATFORM_PUBLIC_PATHS = ["/platform/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/platform")) {
    const hasPlatformSession = request.cookies.has(PLATFORM_SESSION_COOKIE);
    const isPlatformPublicPath = PLATFORM_PUBLIC_PATHS.some((path) => pathname.startsWith(path));

    if (!hasPlatformSession && !isPlatformPublicPath) {
      return NextResponse.redirect(new URL("/platform/login", request.url));
    }
    if (hasPlatformSession && isPlatformPublicPath) {
      return NextResponse.redirect(new URL("/platform", request.url));
    }
    return NextResponse.next();
  }

  const isAlwaysPublicPath = ALWAYS_PUBLIC_PATHS.some((path) =>
    pathname.startsWith(path),
  );
  if (isAlwaysPublicPath) {
    return NextResponse.next();
  }

  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isPublicPath = PUBLIC_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );

  if (!hasSession && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSession && isPublicPath) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
