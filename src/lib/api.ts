import { z } from 'zod';
import { PageError } from './pages';

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
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

const PAGE_ERROR_STATUS = { not_found: 404, invalid: 400, conflict: 409, forbidden: 403, too_large: 413 } as const;

/** Turn a PageError into a JSON response; rethrow anything else. */
export function pageErrorResponse(err: unknown) {
  if (err instanceof PageError) return Response.json({ error: err.message, code: err.code }, { status: PAGE_ERROR_STATUS[err.code] });
  throw err;
}
