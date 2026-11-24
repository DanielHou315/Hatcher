import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';
import { appSecurityHeaders, contentOrigin } from '@/lib/sandbox';

// Everything is sign-in only. This checks that a session cookie is present; pages verify the
// session itself. APIs and page content (/c/) are not matched: they authenticate each request
// (session, API key, or the content token), and middleware would cap their request bodies at 10 MB.

const SIGNED_OUT_OK = /^\/(login|signup|forgot-password|reset-password|two-factor)(\/|$)/;

function withHeaders(res: NextResponse) {
  for (const [k, v] of Object.entries(appSecurityHeaders())) res.headers.set(k, v);
  return res;
}

export function middleware(request: NextRequest) {
  const content = contentOrigin();
  // The content origin serves page content only, never the app.
  if (content && request.headers.get('host') === new URL(content).host) return new NextResponse('Not found', { status: 404 });
  const { pathname, search } = request.nextUrl;
  if (SIGNED_OUT_OK.test(pathname) || getSessionCookie(request)) return withHeaders(NextResponse.next());
  const url = new URL('/login', request.url);
  if (pathname !== '/') url.searchParams.set('next', pathname + search);
  return withHeaders(NextResponse.redirect(url));
}

export const config = {
  runtime: 'nodejs',
  // Everything except the APIs, page content, shared fonts and build assets.
  matcher: ['/((?!api/|c/|_lib/|_next/|icon\\.svg|favicon\\.ico).*)'],
};
