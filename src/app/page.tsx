import Link from 'next/link';
import { redirect } from 'next/navigation';
import { usersById } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { when } from '@/lib/format';
import { getViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

const FILTERS = { all: 'All', mine: 'Mine', shared: 'Shared with me' } as const;
type Filter = keyof typeof FILTERS;

type Props = { searchParams: Promise<{ show?: string; q?: string }> };

export default async function PagesHome({ searchParams }: Props) {
  const viewer = await getViewer();
  if (!viewer) redirect('/login');
  const params = await searchParams;
  const show: Filter = params.show === 'mine' || params.show === 'shared' ? params.show : 'all';
  const q = (params.q ?? '').trim().toLowerCase();

  const all = getDb().visiblePages(viewer.id);
  const pages = all
    .filter((p) => show === 'all' || (show === 'mine' ? p.access === 'owner' : p.access !== 'owner'))
    .filter((p) => !q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  const owners = usersById(pages.filter((p) => p.access !== 'owner').map((p) => p.owner_id));
  const href = (f: Filter) => `/?${new URLSearchParams({ ...(f !== 'all' ? { show: f } : {}), ...(q ? { q } : {}) })}`;

  return (
    <div className="shell shell-main flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="title text-[2.1rem]">Pages</h1>
        <Link href="/new" className="btn" data-tone="primary">
          New page
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <nav className="segmented" aria-label="Show">
          {(Object.keys(FILTERS) as Filter[]).map((f) => (
            <Link key={f} href={href(f)} aria-current={f === show ? 'page' : undefined}>
              {FILTERS[f]}
            </Link>
          ))}
        </nav>
        <form className="field ml-auto w-full max-w-xs" action="/">
          {show !== 'all' && <input type="hidden" name="show" value={show} />}
          <input name="q" type="search" defaultValue={params.q ?? ''} placeholder="Search titles and descriptions" aria-label="Search" />
        </form>
      </div>

      {all.length === 0 ? (
        <div className="panel measure">
          <h2>No pages yet</h2>
          <p>
            Paste or upload HTML on the <Link href="/new">new page</Link> form, or let an agent publish through the API with a key from your{' '}
            <Link href="/account">account</Link>. Pages are private until you share them.
          </p>
        </div>
      ) : pages.length === 0 ? (
        <p className="text-muted">Nothing matches.</p>
      ) : (
        <ul className="page-grid">
          {pages.map((p) => (
            <li key={p.id} className="flex">
              <Link href={`/p/${p.id}`} className="page-card w-full">
                <h2>{p.title}</h2>
                {p.description && <p>{p.description}</p>}
                <footer>
                  {p.access !== 'owner' && (
                    <span className="pill" data-tone={p.access}>
                      {p.access === 'write' ? 'can edit' : 'view only'}
                    </span>
                  )}
                  {p.access !== 'owner' && <span>{owners.get(p.owner_id)?.name || owners.get(p.owner_id)?.email || 'someone'}</span>}
                  <span className="num">v{p.version}</span>
                  <span>{when(p.updated_at)}</span>
                </footer>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
