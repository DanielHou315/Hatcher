import Link from 'next/link';
import type { Entry } from '@/lib/content';
import { entryHref, MAX_TAGS, type ProgressStatus } from '@/lib/kinds';
import { StatusDot } from './StatusDot';

/** The quiet line under a title and its introduction: tags, level, reading time. */
export function EntryMeta({ entry }: { entry: Entry }) {
  const tags = entry.tags.slice(0, MAX_TAGS);
  const facts = [entry.level ? `Level ${entry.level}` : null, entry.minutes ? `${entry.minutes} min` : null].filter(
    (f): f is string => Boolean(f),
  );
  if (tags.length === 0 && facts.length === 0) return null;
  return (
    <div className="entry-meta">
      {tags.map((t) => (
        <Link key={t} href={`/library?tag=${encodeURIComponent(t)}`} className="tag">
          #{t}
        </Link>
      ))}
      {facts.map((f) => (
        <span key={f}>{f}</span>
      ))}
    </div>
  );
}

export function EntryCard({ entry, status }: { entry: Entry; status: ProgressStatus }) {
  const href = entryHref(entry.kind, entry.slug);
  return (
    <article className="entry-card">
      <h3 className="entry-card-title">
        {!entry.error && <StatusDot status={status} />}
        <Link href={href} className="text-ink no-underline hover:text-accent">
          {entry.title}
        </Link>
        {entry.status === 'draft' && <span className="pill" data-tone="draft">draft</span>}
        {entry.error && <span className="pill" data-tone="invalid">invalid</span>}
      </h3>
      {entry.error ? (
        <p className="mono text-sm break-words text-danger">{entry.error}</p>
      ) : (
        <>
          {entry.summary && <p className="entry-intro measure">{entry.summary}</p>}
          <EntryMeta entry={entry} />
        </>
      )}
    </article>
  );
}
