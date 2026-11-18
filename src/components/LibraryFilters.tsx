'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { consumeSearchFocusRequest } from './KeyboardShortcuts';

interface Option {
  value: string;
  label: string;
}

export interface FilterOptions {
  kinds: Option[];
  levels: Option[];
  statuses: Option[];
  tags: Option[];
  sorts: Option[];
}

const KEYS = ['kind', 'level', 'status', 'tag', 'sort'] as const;

export function LibraryFilters({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (consumeSearchFocusRequest()) inputRef.current?.focus();
  }, []);

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  // Debounce free-text search into the URL.
  useEffect(() => {
    if (q === (params.get('q') ?? '')) return;
    const t = setTimeout(() => update('q', q.trim()), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const selects: { key: (typeof KEYS)[number]; label: string; opts: Option[]; all: string }[] = [
    { key: 'kind', label: 'Kind', opts: options.kinds, all: 'All kinds' },
    { key: 'level', label: 'Level', opts: options.levels, all: 'Any level' },
    { key: 'status', label: 'Status', opts: options.statuses, all: 'Any status' },
    { key: 'tag', label: 'Tag', opts: options.tags, all: 'Any tag' },
    { key: 'sort', label: 'Sort', opts: options.sorts, all: '' },
  ];
  const shown = selects.filter((s) => s.key === 'sort' || s.opts.length > 0);
  const active = KEYS.some((k) => k !== 'sort' && params.get(k)) || Boolean(params.get('q'));

  return (
    <form role="search" className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()} aria-busy={isPending}>
      <label className="flex items-center gap-3 border-b border-line pb-1 focus-within:border-accent">
        <span className="label">Search</span>
        <input
          id="library-search"
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Title, summary, tag"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[1.05rem] outline-none placeholder:text-muted"
          autoComplete="off"
        />
        <kbd className="label rounded-none border border-line px-1.5">/</kbd>
      </label>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 xl:grid-cols-5">
        {shown.map((s) => (
          <label key={s.key} className="flex min-w-0 flex-col gap-0.5">
            <span className="label">{s.label}</span>
            <select
              value={params.get(s.key) ?? (s.key === 'sort' ? 'title' : '')}
              onChange={(e) => update(s.key, s.key === 'sort' && e.target.value === 'title' ? '' : e.target.value)}
              className="min-w-0 border border-line bg-surface px-2 py-1.5 text-[0.9rem]"
            >
              {s.all && <option value="">{s.all}</option>}
              {s.opts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {active && (
        <button
          type="button"
          className="label w-fit cursor-pointer hover:text-ink"
          onClick={() => {
            setQ('');
            const sort = params.get('sort');
            startTransition(() => router.replace(sort ? `${pathname}?sort=${sort}` : pathname, { scroll: false }));
          }}
        >
          Clear filters
        </button>
      )}
    </form>
  );
}
