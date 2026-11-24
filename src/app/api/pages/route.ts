import { pageErrorResponse, unauthorized } from '@/lib/api';
import { dataDir, getDb } from '@/lib/db';
import { foreignOrigin } from '@/lib/origin';
import { createPage } from '@/lib/pages';
import { formText, readUpload } from '@/lib/uploads';
import { getViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Create a page from pasted HTML and/or uploaded files. */
export async function POST(request: Request) {
  const rejected = foreignOrigin(request);
  if (rejected) return rejected;
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  try {
    const { form, files } = await readUpload(request);
    const db = getDb();
    const page = createPage(db, dataDir(), { userId: viewer.id }, {
      title: formText(form, 'title') ?? '',
      description: formText(form, 'description'),
      files,
    });
    db.audit({ userId: viewer.id, action: 'create_page', target: page.id, ok: true });
    return Response.json({ id: page.id, version: page.version }, { status: 201 });
  } catch (err) {
    return pageErrorResponse(err);
  }
}
