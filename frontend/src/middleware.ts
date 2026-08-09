import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "pm_session";

// Routes accessible without auth; everything else is a protected app route.
const AUTH_ROUTES = new Set(["/login", "/signup"]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  const isAuthRoute = AUTH_ROUTES.has(pathname);
  const isRoot = pathname === "/";

  if (isAuthRoute || isRoot) {
    // Public routes: always render them. We deliberately do NOT redirect
    // logged-in users to /dashboard here, because middleware only sees cookie
    // presence, not validity - a stale/expired pm_session cookie would bounce
    // /login -> /dashboard even when the session is dead, trapping the user in
    // a redirect loop. Sending authenticated users to the dashboard is instead
    // handled by useRedirectIfAuthenticated, which validates via /v1/user/self.
    return NextResponse.next();
  }

  // All other routes are protected — gate them at the edge before any render.
  // Note: this checks cookie presence only, not cryptographic validity. The
  // client-side useRequireAuth remains the authoritative guard for expired or
  // tampered sessions; middleware just eliminates the unauthenticated flash.
  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on every route except Next.js internals and static assets.
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg).*)",
  ],
};
