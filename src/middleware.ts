import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

// Everything is sign-in only. This checks that a session cookie is present; pages and APIs verify
// the session itself. Page content (/c/) carries its own signed token instead.

const SIGNED_OUT_OK = /^\/(login|signup|forgot-password|reset-password|two-factor|api\/|c\/)/;

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (SIGNED_OUT_OK.test(pathname) || getSessionCookie(request)) return NextResponse.next();
  const url = new URL('/login', request.url);
  if (pathname !== '/') url.searchParams.set('next', pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  runtime: 'nodejs',
  // Everything except shared fonts and build assets.
  matcher: ['/((?!_lib/|_next/|icon\\.svg|favicon\\.ico).*)'],
};
