/**
 * Reject state-changing requests sent from another origin, including sandboxed page code
 * (whose Origin is "null"). Requests without an Origin header (curl, same-origin GET) pass.
 */
export function foreignOrigin(request: Request): Response | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  let host: string | null = null;
  try {
    host = new URL(origin).host;
  } catch {
    // "null" or malformed
  }
  if (host && host === request.headers.get('host')) return null;
  return Response.json({ error: 'cross-origin request' }, { status: 403 });
}
