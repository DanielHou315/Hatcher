import { z } from 'zod';
import { badRequest, pageErrorResponse, readJson } from '@/lib/api';
import { restore } from '@/lib/page-api';
import { apiContext } from '@/lib/requester';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

const body = z.object({ version: z.number().int().min(1), expectedVersion: z.number().int().min(1) });

/** Save a new version that copies an older one. History is kept. */
export async function POST(request: Request, { params }: Context) {
  const ctx = await apiContext(request);
  if (ctx instanceof Response) return ctx;
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(parsed.error);
  try {
    return Response.json(restore(ctx, (await params).id, parsed.data.version, parsed.data.expectedVersion), { status: 201 });
  } catch (err) {
    return pageErrorResponse(err);
  }
}
