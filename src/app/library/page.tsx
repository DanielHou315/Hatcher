import { Suspense } from 'react';
import { EntryCard } from '@/components/EntryCard';
import { LibraryFilters, type FilterOptions } from '@/components/LibraryFilters';
import { filterEntries, type Filters } from '@/lib/content';
import { progressLookup } from '@/lib/db';
import { viewerSite } from '@/lib/viewer';
import { TRACKS } from '@/lib/tracks';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Library' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function first(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s : undefined;
}

export default async function LibraryPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filters: Filters = {
    q: first(sp.q),
    kind: first(sp.kind),
    track: first(sp.track),
    level: first(sp.level),
    status: first(sp.status),
    tag: first(sp.tag),
    sort: first(sp.sort),
  };
  const { viewer, site } = await viewerSite();
  const statusOf = progressLookup(viewer?.id);
  const results = filterEntries(site.entries, filters, statusOf);

  const options: FilterOptions = {
    kinds: [
      { value: 'concept', label: 'Concepts' },
      { value: 'paper', label: 'Papers' },
      { value: 'roadmap', label: 'Roadmaps' },
    ],
    tracks: TRACKS.map((t) => ({ value: t.id, label: t.name })),
    levels: [1, 2, 3, 4, 5].map((l) => ({ value: String(l), label: `Level ${l}` })),
    statuses: [
      { value: 'not-started', label: 'Not started' },
      { value: 'in-progress', label: 'In progress' },
      { value: 'done', label: 'Done' },
    ],
    tags: [...site.tagCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag, n]) => ({ value: tag, label: `${tag} (${n})` })),
    sorts: [
      { value: 'title', label: 'Title' },
      { value: 'level', label: 'Level' },
      { value: 'updated', label: 'Updated' },
    ],
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="title text-[2.1rem]">Library</h1>
        <span className="label">
          {results.length} of {site.entries.length} entries
        </span>
      </div>
      <Suspense>
        <LibraryFilters options={options} />
      </Suspense>
      {results.length === 0 ? (
        <p className="border-t border-line pt-4 text-muted">
          {site.entries.length === 0 ? 'No content yet. Pages appear here as soon as they land in content/.' : 'Nothing matches these filters.'}
        </p>
      ) : (
        <div className="flex flex-col">
          {results.map((e) => (
            <EntryCard key={`${e.kind}/${e.slug}`} entry={e} status={statusOf(e.slug)} />
          ))}
        </div>
      )}
    </div>
  );
}
