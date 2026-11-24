import { z } from 'zod';
import { badRequest, pageErrorResponse, readJson } from '@/lib/api';
import { getPage, remove, rename } from '@/lib/page-api';
import { LIMITS } from '@/lib/pages';
import { apiContext, versionParam } from '@/lib/requester';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

/** A page's details, its files and warnings, for the current version or `?version=N`. */
export async function GET(request: Request, { params }: Context) {
  const ctx = await apiContext(request);
  if (ctx instanceof Response) return ctx;
  try {
    return Response.json(getPage(ctx, (await params).id, versionParam(request)));
  } catch (err) {
    return pageErrorResponse(err);
  }
}

const detailsBody = z.object({
  title: z.string().max(LIMITS.title).optional(),
  description: z.string().max(LIMITS.description).optional(),
});

/** Rename a page or change its description (owner only; no new version). */
export async function PATCH(request: Request, { params }: Context) {
  const ctx = await apiContext(request);
  if (ctx instanceof Response) return ctx;
  const parsed = detailsBody.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(parsed.error);
  try {
    return Response.json(rename(ctx, (await params).id, parsed.data));
  } catch (err) {
    return pageErrorResponse(err);
  }
}

/** Delete a page with every version and share (owner only). */
export async function DELETE(request: Request, { params }: Context) {
  const ctx = await apiContext(request);
  if (ctx instanceof Response) return ctx;
  try {
    remove(ctx, (await params).id);
    return Response.json({ ok: true });
  } catch (err) {
    return pageErrorResponse(err);
  }
}
