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
    // Logged-in users don't need the landing page or auth forms.
    if (hasSession) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
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
