import { forbidden, notFound, pageErrorResponse, unauthorized } from '@/lib/api';
import { dataDir, getDb } from '@/lib/db';
import { foreignOrigin } from '@/lib/origin';
import { accessTo, canWrite } from '@/lib/page-access';
import { PageError, updatePage } from '@/lib/pages';
import { formText, readUpload } from '@/lib/uploads';
import { getViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

/** Save a new version: changed or added files, removed files, based on `expectedVersion`. */
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
  try {
    const { form, files, remove } = await readUpload(request);
    const expected = Number(formText(form, 'expectedVersion'));
    if (!Number.isInteger(expected)) throw new PageError('invalid', 'expectedVersion is required');
    const version = updatePage(db, dataDir(), page.id, { userId: viewer.id }, {
      expectedVersion: expected,
      files,
      delete: remove,
      note: formText(form, 'note'),
    });
    db.audit({ userId: viewer.id, action: 'update_page', target: `${page.id}@${version}`, ok: true });
    return Response.json({ version }, { status: 201 });
  } catch (err) {
    return pageErrorResponse(err);
  }
}
