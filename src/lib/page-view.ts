import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { getDb, type PageRow } from './db';
import { accessTo, type PageAccess } from './page-access';
import { getViewer, type Viewer } from './viewer';

/** The page for a server-rendered view, after checking the viewer may read it. 404 otherwise. */
export async function loadPageForViewer(id: string, next: string): Promise<{ viewer: Viewer; page: PageRow; access: PageAccess }> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(next)}`);
  const db = getDb();
  const page = db.page(id);
  const access = page ? accessTo(db, page, viewer.id) : null;
  if (!page || !access) notFound();
  return { viewer, page, access };
}
