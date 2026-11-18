import Link from 'next/link';
import { EntryMeta } from '@/components/EntryCard';
import { ProgressBar } from '@/components/StatusDot';
import { recentEntries, roadmapOrder, type Entry } from '@/lib/content';
import { progressLookup, userProgress } from '@/lib/db';
import { viewerSite } from '@/lib/viewer';
import { entryHref } from '@/lib/kinds';

export const dynamic = 'force-dynamic';

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="num text-[1.6rem] leading-tight">{value}</span>
      <span className="label">{label}</span>
    </div>
  );
}

function TodayItem({ heading, entry, action }: { heading: string; entry: Entry; action: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="label text-accent">{heading}</div>
      <Link href={entryHref(entry.kind, entry.slug)} className="font-display text-[1.5rem] text-ink no-underline hover:text-accent">
        {entry.title}
      </Link>
      {entry.summary && <p className="entry-intro">{entry.summary}</p>}
      <EntryMeta entry={entry} />
      <Link href={entryHref(entry.kind, entry.slug)} className="label w-fit text-accent">
        {action} →
      </Link>
    </div>
  );
}

export default async function Home() {
  const { viewer, site } = await viewerSite();
  const statusOf = progressLookup(viewer?.id);
  const progress = viewer ? userProgress(viewer.id) : null;
  const primary = site.primaryRoadmap;
  const nextUp = site.primaryOrder.map((s) => site.bySlug.get(s)!).find((e) => statusOf(e.slug) !== 'done');
  const continueSlug = (progress?.getRecent(20) ?? []).find((s: string) => statusOf(s) === 'in-progress' && site.bySlug.has(s) && s !== nextUp?.slug);
  const continuing = continueSlug ? site.bySlug.get(continueSlug) : undefined;
  const stats = progress?.getStats(site.pages) ?? { done: 0, inProgress: 0, total: site.pages.length, doneMinutes: 0 };
  const streak = progress?.getStreak() ?? 0;
  const recent = recentEntries(site.entries, 6);
  const fallback = !nextUp && !continuing ? site.pages.find((p) => statusOf(p.slug) !== 'done') : undefined;

  return (
    <div className="flex flex-col gap-12">
      {/* Today */}
      <section aria-labelledby="today" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 id="today" className="font-display text-[2rem]">
            Today
          </h1>
          <p className="text-sm text-muted">The mathematics behind the papers, one page a day.</p>
        </div>
        {/* Progress (continue, streak, stats) exists only for signed-in readers of the studio. */}
        <div
          className={`grid gap-6 border-y border-line py-5 ${viewer ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]' : ''}`}
        >
          {nextUp ? (
            <TodayItem heading={`Next up · ${primary?.title ?? ''}`} entry={nextUp} action="Read" />
          ) : fallback ? (
            <TodayItem heading="Start here" entry={fallback} action="Read" />
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="label text-accent">Next up</div>
              <p className="text-muted">
                {primary
                  ? `Everything in ${primary.title} is done.`
                  : site.pages.length
                    ? 'Every page is done. New ones will appear here as they are written.'
                    : 'No pages yet. They appear here as soon as they land in content/.'}
              </p>
            </div>
          )}
          {viewer &&
            (continuing ? (
              <TodayItem heading="Continue" entry={continuing} action="Resume" />
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="label">Continue</div>
                <p className="text-[0.95rem] text-muted">Nothing in progress. Mark a page “In progress” to pick it up here.</p>
              </div>
            ))}
          {viewer && (
            <div className="flex gap-7 lg:flex-col lg:gap-3 lg:border-l lg:border-line lg:pl-6">
              <Stat value={streak} label="day streak" />
              <Stat value={`${stats.done}/${stats.total}`} label="pages done" />
              <Stat value={stats.doneMinutes} label="minutes read" />
            </div>
          )}
        </div>
      </section>

      {/* Roadmaps */}
      {site.roadmaps.length > 0 && (
        <section aria-labelledby="roadmaps" className="flex flex-col gap-4">
          <h2 id="roadmaps" className="font-display text-[1.5rem]">
            Roadmaps
          </h2>
          {site.roadmaps.length === 0 ? (
            <p className="text-muted">No roadmaps yet. A roadmap orders concept and paper pages into stages.</p>
          ) : (
            <ul className="flex flex-col">
              {site.roadmaps.map((r) => {
                const items = roadmapOrder(r).filter((s) => site.bySlug.has(s));
                const done = items.filter((s) => statusOf(s) === 'done').length;
                return (
                  <li key={r.slug} className="grid gap-2 border-t border-line py-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:gap-6">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-3">
                        <Link href={entryHref('roadmap', r.slug)} className="font-semibold text-ink no-underline hover:text-accent">
                          {r.title}
                        </Link>
                        {r === primary && <span className="pill">primary</span>}
                        {r.status === 'draft' && <span className="pill" data-tone="draft">draft</span>}
                      </div>
                      <p className="text-sm text-muted">{r.summary}</p>
                    </div>
                    <div className="flex flex-col justify-center gap-1.5">
                      <ProgressBar done={done} total={items.length} />
                      <span className="label">
                        {r.stages?.length ?? 0} stages · {done}/{items.length} done
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* Recent */}
      <section aria-labelledby="recent" className="flex flex-col gap-4">
        <h2 id="recent" className="font-display text-[1.5rem]">
          Recently added or updated
        </h2>
        {recent.length === 0 ? (
          <p className="text-muted">Nothing yet.</p>
        ) : (
          <ul className="grid gap-x-8 sm:grid-cols-2">
            {recent.map((e) => (
              <li key={`${e.kind}/${e.slug}`} className="flex flex-col gap-0.5 border-t border-line py-3">
                <span className="eyebrow">
                  {e.updated ?? e.created ?? ''} · {e.kind}
                </span>
                <Link href={entryHref(e.kind, e.slug)} className="text-ink no-underline hover:text-accent">
                  {e.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
