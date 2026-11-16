import Link from 'next/link';
import type { Entry } from '@/lib/content';
import { entryHref, trackName, type ProgressStatus } from '@/lib/tracks';
import { StatusDot } from './StatusDot';

export function Eyebrow({ entry, withKind = true }: { entry: Entry; withKind?: boolean }) {
  const parts = [
    entry.track ? trackName(entry.track) : undefined,
    entry.level ? `Level ${entry.level}` : undefined,
    entry.minutes ? `${entry.minutes} min` : undefined,
    withKind ? entry.kind : undefined,
  ].filter(Boolean);
  return <div className="eyebrow">{parts.join(' · ')}</div>;
}

export function EntryCard({ entry, status }: { entry: Entry; status: ProgressStatus }) {
  const href = entryHref(entry.kind, entry.slug);
  return (
    <article className="flex flex-col gap-1.5 border-t border-line py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="eyebrow">
          {entry.kind}
          {entry.track ? ` · ${trackName(entry.track)}` : ''}
        </span>
        {entry.level && <span className="pill">L{entry.level}</span>}
        {entry.minutes && <span className="eyebrow">{entry.minutes} min</span>}
        {entry.status === 'draft' && <span className="pill" data-tone="draft">draft</span>}
        {entry.error && <span className="pill" data-tone="invalid">invalid</span>}
      </div>
      <h3 className="flex items-center gap-2 text-[1.08rem] font-semibold leading-snug">
        {!entry.error && <StatusDot status={status} />}
        <Link href={href} className="text-ink no-underline hover:text-accent">
          {entry.title}
        </Link>
      </h3>
      {entry.error ? (
        <p className="mono text-sm break-words text-danger">{entry.error}</p>
      ) : (
        entry.summary && <p className="measure text-muted">{entry.summary}</p>
      )}
      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {entry.tags.map((t) => (
            <Link key={t} href={`/library?tag=${encodeURIComponent(t)}`} className="tag">
              #{t}
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}
