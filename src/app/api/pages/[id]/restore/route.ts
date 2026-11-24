import { z } from 'zod';
import { badRequest, forbidden, notFound, pageErrorResponse, readJson, unauthorized } from '@/lib/api';
import { dataDir, getDb } from '@/lib/db';
import { foreignOrigin } from '@/lib/origin';
import { accessTo, canWrite } from '@/lib/page-access';
import { restoreVersion } from '@/lib/pages';
import { getViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

const body = z.object({ version: z.number().int().min(1), expectedVersion: z.number().int().min(1) });

/** Make the page's newest version a copy of an older one. History is kept. */
export async function POST(request: Request, { params }: Context) {
  const rejected = foreignOrigin(request);
  if (rejected) return rejected;
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  const db = getDb();
  const page = db.page((await params).id);
  const access = page ? accessTo(db, page, viewer.id) : null;
  if (!page || !access) return notFound('no such page');
  if (!canWrite(access)) return forbidden('you can only read this page');
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const version = restoreVersion(db, dataDir(), page.id, { userId: viewer.id }, parsed.data.version, parsed.data.expectedVersion);
    db.audit({ userId: viewer.id, action: 'restore_version', target: `${page.id}@${parsed.data.version}`, ok: true });
    return Response.json({ version }, { status: 201 });
  } catch (err) {
    return pageErrorResponse(err);
  }
}
