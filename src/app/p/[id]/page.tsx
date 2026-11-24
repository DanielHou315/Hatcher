import type { Metadata } from 'next';
import Link from 'next/link';
import { usersById } from '@/lib/auth';
import { signContentToken } from '@/lib/content-token';
import { getDb } from '@/lib/db';
import { accessTo, canWrite } from '@/lib/page-access';
import { loadPageForViewer } from '@/lib/page-view';
import { getViewer } from '@/lib/viewer';
import { contentOrigin, FRAME_SANDBOX, pageContentBase } from '@/lib/sandbox';
import { authSettings } from '@/lib/settings';
import { PageFrame, VersionPicker } from '@/components/pages/PageViewer';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // Only someone who may read the page learns its title.
  const viewer = await getViewer();
  const db = getDb();
  const page = db.page((await params).id);
  return { title: viewer && page && accessTo(db, page, viewer.id) ? page.title : 'Page' };
}

export default async function ViewPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { page, access, viewer } = await loadPageForViewer(id, `/p/${id}`);
  const requested = Number((await searchParams).v);
  const version = Number.isInteger(requested) && requested >= 1 && requested <= page.version ? requested : page.version;
  // Name the file: Next drops a trailing slash, which would break the page's relative URLs.
  const src = `${pageContentBase(page.id, version, signContentToken(authSettings().secret, page.id, version, viewer.id))}index.html`;
  const owner = access === 'owner' ? null : usersById([page.owner_id]).get(page.owner_id);
  const versions = getDb().versions(page.id).map((v) => ({ version: v.version, at: v.created_at, note: v.note }));

  return (
    <div className="viewer">
      <div className="viewer-bar">
        <h1>{page.title}</h1>
        {owner !== null && (
          <span className="flex items-center gap-2 text-[0.85rem] text-muted">
            <span className="pill" data-tone={access}>
              {access === 'write' ? 'can edit' : 'view only'}
            </span>
            {owner?.name || owner?.email || 'someone'}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <VersionPicker id={page.id} shown={version} versions={versions} />
          {/* Only with a separate content origin: on the site's own address a page must stay framed. */}
          {contentOrigin() && (
            <a href={src} target="_blank" rel="noopener noreferrer" className="btn" data-size="small" title="Open the page by itself in a new tab">
              Open
            </a>
          )}
          {canWrite(access) && (
            <Link href={`/p/${page.id}/manage`} className="btn" data-size="small">
              {access === 'owner' ? 'Share & edit' : 'Edit'}
            </Link>
          )}
        </div>
      </div>
      {version < page.version && (
        <p className="border-b border-line bg-accent-soft px-4 py-2 text-[0.88rem]">
          You are looking at version {version} of {page.version}. <Link href={`/p/${page.id}`}>See the latest</Link>
          {canWrite(access) && (
            <>
              {' '}
              or restore this one from <Link href={`/p/${page.id}/manage#versions`}>the history</Link>
            </>
          )}
          .
        </p>
      )}
      <PageFrame id={page.id} src={src} title={page.title} sandbox={FRAME_SANDBOX} version={version} follow={version === page.version} key={`${viewer.id}-${src}`} />
    </div>
  );
}
