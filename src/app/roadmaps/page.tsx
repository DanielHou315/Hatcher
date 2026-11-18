import Link from 'next/link';
import { ProgressBar } from '@/components/StatusDot';
import { roadmapOrder } from '@/lib/content';
import { progressLookup } from '@/lib/db';
import { viewerSite } from '@/lib/viewer';
import { entryHref } from '@/lib/kinds';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Roadmaps' };

export default async function RoadmapsPage() {
  const { viewer, site } = await viewerSite();
  const statusOf = progressLookup(viewer?.id);
  const invalid = site.entries.filter((e) => e.kind === 'roadmap' && e.error);
  return (
    <div className="measure flex flex-col gap-6">
      <h1 className="title text-[2.1rem]">Roadmaps</h1>
      {site.roadmaps.length === 0 && invalid.length === 0 && (
        <p className="text-muted">No roadmaps yet. Add one under content/roadmaps/.</p>
      )}
      <ul className="flex flex-col">
        {site.roadmaps.map((r) => {
          const items = roadmapOrder(r).filter((s) => site.bySlug.has(s));
          const done = items.filter((s) => statusOf(s) === 'done').length;
          return (
            <li key={r.slug} className="flex flex-col gap-2 border-t border-line py-4">
              <div className="flex items-center gap-3">
                <Link href={entryHref('roadmap', r.slug)} className="font-display text-[1.35rem] text-ink no-underline hover:text-accent">
                  {r.title}
                </Link>
                {r === site.primaryRoadmap && <span className="pill">primary</span>}
                {r.status === 'draft' && <span className="pill" data-tone="draft">draft</span>}
              </div>
              <p className="text-muted">{r.summary}</p>
              <ProgressBar done={done} total={items.length} />
              <span className="label">
                {r.stages?.length ?? 0} stages · {done}/{items.length} done
              </span>
            </li>
          );
        })}
        {invalid.map((r) => (
          <li key={r.slug} className="flex flex-col gap-1 border-t border-line py-4">
            <div className="flex items-center gap-3">
              <Link href={entryHref('roadmap', r.slug)} className="text-ink">
                {r.title}
              </Link>
              <span className="pill" data-tone="invalid">invalid</span>
            </div>
            <p className="mono text-sm text-danger">{r.error}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
