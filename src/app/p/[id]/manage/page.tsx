import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DeletePage, DetailsForm, FilesEditor, History, Sharing } from '@/components/pages/ManagePage';
import { usersById } from '@/lib/auth';
import { dataDir, getDb } from '@/lib/db';
import { canManage, canWrite } from '@/lib/page-access';
import { loadPageForViewer } from '@/lib/page-view';
import { MAIN_FILE, pageFiles, readPageFile } from '@/lib/pages';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Manage page' };

const MAX_EDITABLE = 1024 * 1024;

type Props = { params: Promise<{ id: string }> };

export default async function ManagePage({ params }: Props) {
  const { id } = await params;
  const { page, access } = await loadPageForViewer(id, `/p/${id}/manage`);
  if (!canWrite(access)) notFound();
  const db = getDb();
  const files = pageFiles(dataDir(), page.id, page.version);
  const main = files.find((f) => f.path === MAIN_FILE);
  const indexHtml = main && main.size <= MAX_EDITABLE ? readPageFile(dataDir(), page.id, page.version, MAIN_FILE).toString('utf8') : null;
  const versions = db.versions(page.id);
  const people = usersById([...versions.map((v) => v.author_id), ...db.shares(page.id).map((s) => s.user_id)]);
  const shares = db.shares(page.id).map((s) => ({
    userId: s.user_id,
    name: people.get(s.user_id)?.name ?? '',
    email: people.get(s.user_id)?.email ?? '(deleted account)',
    access: s.access,
  }));

  return (
    <div className="shell shell-main">
      <div className="measure flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <Link href={`/p/${page.id}`} className="label no-underline hover:text-ink">
            ← Back to the page
          </Link>
          <h1 className="title text-[2.1rem]">{page.title}</h1>
        </header>
        {canManage(access) && <DetailsForm id={page.id} title={page.title} description={page.description} />}
        {canManage(access) && <Sharing id={page.id} initial={shares} />}
        <FilesEditor id={page.id} version={page.version} files={files} indexHtml={indexHtml} />
        <History
          id={page.id}
          current={page.version}
          canRestore
          versions={versions.map((v) => ({
            version: v.version,
            at: v.created_at,
            note: v.note,
            author: (people.get(v.author_id)?.name || people.get(v.author_id)?.email || 'deleted account') + (v.key_id ? ' (agent)' : ''),
            files: v.files,
            bytes: v.bytes,
          }))}
        />
        {canManage(access) && <DeletePage id={page.id} title={page.title} />}
      </div>
    </div>
  );
}
