import { z } from 'zod';
import { readCapped } from './body';
import { PageError } from './pages';

/** Small JSON bodies (settings, shares, keys): at most 256 KB. Undefined when missing, invalid or too large. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return JSON.parse((await readCapped(request, 256 * 1024)).toString('utf8'));
  } catch {
    return undefined;
  }
}

export function tooManyRequests(message = 'too many requests; try again in a few minutes') {
  return Response.json({ error: message, code: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '60' } });
}

export function badRequest(error: z.ZodError | string) {
  const message = typeof error === 'string' ? error : error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
  return Response.json({ error: message }, { status: 400 });
}

export function unauthorized(message = 'sign in required') {
  return Response.json({ error: message }, { status: 401 });
}

export function forbidden(message = 'not allowed') {
  return Response.json({ error: message }, { status: 403 });
}

export function notFound(message = 'not found') {
  return Response.json({ error: message }, { status: 404 });
}

const PAGE_ERROR_STATUS = { not_found: 404, invalid: 400, conflict: 409, forbidden: 403, too_large: 413, quota: 413 } as const;

/** Turn a PageError into a JSON response; rethrow anything else. */
export function pageErrorResponse(err: unknown) {
  if (err instanceof PageError) return Response.json({ error: err.message, code: err.code }, { status: PAGE_ERROR_STATUS[err.code] });
  throw err;
}
