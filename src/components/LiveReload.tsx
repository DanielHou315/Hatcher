'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type State = 'connecting' | 'live' | 'offline';

/** Subscribes to /api/watch and refreshes server components when content changes. */
export function LiveReload() {
  const router = useRouter();
  const [state, setState] = useState<State>('connecting');

  useEffect(() => {
    let source: EventSource | null = null;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      setState('connecting');
      source = new EventSource('/api/watch');
      source.onopen = () => {
        attempt = 0;
        setState('live');
      };
      source.addEventListener('change', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => router.refresh(), 400);
      });
      source.onerror = () => {
        source?.close();
        source = null;
        setState('offline');
        const delay = Math.min(30_000, 1000 * 2 ** attempt);
        attempt += 1;
        retry = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(debounce);
      clearTimeout(retry);
      source?.close();
    };
  }, [router]);

  const text = state === 'live' ? 'live' : state === 'connecting' ? 'connecting' : 'offline';
  return (
    <span className="label inline-flex items-center gap-1.5" title={`Content updates: ${text}`} aria-live="polite">
      <span className="live-dot" data-state={state} aria-hidden="true" />
      <span className="max-[520px]:sr-only">{text}</span>
    </span>
  );
}
