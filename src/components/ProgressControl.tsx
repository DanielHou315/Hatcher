'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { ProgressStatus } from '@/lib/tracks';
import { StatusDot } from './StatusDot';

const OPTIONS: { value: ProgressStatus; label: string }[] = [
  { value: 'not-started', label: 'Not started' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
];

export function ProgressControl({ slug, initial }: { slug: string; initial: ProgressStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const pending = useRef(false);

  // Follow server state when it changes underneath (another tab, live refresh).
  useEffect(() => {
    if (!pending.current) setStatus(initial);
  }, [initial]);

  async function choose(next: ProgressStatus) {
    if (next === status) return;
    const previous = status;
    setStatus(next);
    setError(null);
    pending.current = true;
    try {
      const res = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, status: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      startTransition(() => router.refresh());
    } catch (err) {
      setStatus(previous);
      setError(`Could not save (${(err as Error).message})`);
    } finally {
      pending.current = false;
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="label">Progress</div>
      <div className="segmented" role="group" aria-label="Reading progress">
        {OPTIONS.map((o) => (
          <button key={o.value} type="button" aria-pressed={status === o.value} onClick={() => choose(o.value)}>
            <StatusDot status={o.value} />
            {o.label}
          </button>
        ))}
      </div>
      {error && <div className="text-sm text-danger">{error}</div>}
    </div>
  );
}

/** Logs one view per mount; the server dedupes to one per slug per day. */
export function ViewLogger({ slug }: { slug: string }) {
  useEffect(() => {
    void fetch('/api/progress/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
      keepalive: true,
    }).catch(() => {});
  }, [slug]);
  return null;
}
