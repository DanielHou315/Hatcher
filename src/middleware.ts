import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

// The public site (default) has no account or write surface: those routes do not exist there.
// The studio (HATCHER_MODE=studio) is sign-in only; this checks that a session cookie is present
// and pages and APIs verify the session itself.

const STUDIO_ONLY = /^\/(login|signup|account|admin|api\/(auth|keys|progress|mcp))(\/|$)/;
const SIGNED_OUT_OK = /^\/(login|signup|api\/|c\/)/;

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (process.env.HATCHER_MODE !== 'studio') {
    return STUDIO_ONLY.test(pathname) ? new NextResponse('Not found', { status: 404 }) : NextResponse.next();
  }
  if (SIGNED_OUT_OK.test(pathname) || getSessionCookie(request)) return NextResponse.next();
  const url = new URL('/login', request.url);
  url.searchParams.set('next', pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  runtime: 'nodejs',
  // Everything except shared libraries and build assets.
  matcher: ['/((?!_lib/|_next/|icon\\.svg|favicon\\.ico).*)'],
};
