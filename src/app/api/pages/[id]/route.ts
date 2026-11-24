import { z } from 'zod';
import { badRequest, forbidden, notFound, pageErrorResponse, readJson, unauthorized } from '@/lib/api';
import { dataDir, getDb } from '@/lib/db';
import { foreignOrigin } from '@/lib/origin';
import { accessTo, canManage, canRead } from '@/lib/page-access';
import { deletePage, LIMITS, setDetails } from '@/lib/pages';
import { getViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

async function load(context: Context) {
  const viewer = await getViewer();
  if (!viewer) return { error: unauthorized() } as const;
  const db = getDb();
  const page = db.page((await context.params).id);
  const access = page ? accessTo(db, page, viewer.id) : null;
  if (!page || !canRead(access)) return { error: notFound('no such page') } as const;
  return { viewer, db, page, access } as const;
}

/** The current version number, polled by the viewer to reload when a page changes. */
export async function GET(_request: Request, context: Context) {
  const r = await load(context);
  if ('error' in r) return r.error;
  return Response.json({ id: r.page.id, version: r.page.version, title: r.page.title, updatedAt: r.page.updated_at });
}

const detailsBody = z.object({
  title: z.string().max(LIMITS.title).optional(),
  description: z.string().max(LIMITS.description).optional(),
});

/** Rename a page or change its description (owner only; no new version). */
export async function PATCH(request: Request, context: Context) {
  const rejected = foreignOrigin(request);
  if (rejected) return rejected;
  const r = await load(context);
  if ('error' in r) return r.error;
  if (!canManage(r.access)) return forbidden('only the owner can rename a page');
  const parsed = detailsBody.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(parsed.error);
  try {
    setDetails(r.db, r.page.id, parsed.data);
    return Response.json({ ok: true });
  } catch (err) {
    return pageErrorResponse(err);
  }
}

/** Delete a page with every version and share (owner only). */
export async function DELETE(request: Request, context: Context) {
  const rejected = foreignOrigin(request);
  if (rejected) return rejected;
  const r = await load(context);
  if ('error' in r) return r.error;
  if (!canManage(r.access)) return forbidden('only the owner can delete a page');
  deletePage(r.db, dataDir(), r.page.id);
  r.db.audit({ userId: r.viewer.id, action: 'delete_page', target: r.page.id, ok: true });
  return Response.json({ ok: true });
}
