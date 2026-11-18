import { z } from 'zod';
import { PROGRESS_STATUSES } from './kinds';

export const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,199}$/, 'slug must be lowercase letters, digits, hyphens');

export const progressBody = z.object({
  slug: slugSchema,
  status: z.enum(PROGRESS_STATUSES),
  notes: z.string().max(10_000).optional(),
});

export const viewBody = z.object({ slug: slugSchema });

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
