'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { when } from '@/lib/format';

const POLL_MS = 4000;

/**
 * The sandboxed page. While showing the latest version it checks for a newer one and reloads, so
 * a page an agent is writing updates in place.
 */
export function PageFrame({
  id,
  src,
  title,
  sandbox,
  version,
  follow,
}: {
  id: string;
  src: string;
  title: string;
  sandbox: string;
  version: number;
  follow: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!follow) return;
    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        const r = await fetch(`/api/pages/${id}`, { cache: 'no-store' });
        if (!r.ok) return;
        const data = (await r.json()) as { version: number };
        if (!stopped && data.version > version) router.refresh();
      } catch {
        // offline for a moment; try again next tick
      }
    };
    const timer = setInterval(check, POLL_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [id, version, follow, router]);

  return <iframe src={src} title={title} sandbox={sandbox} referrerPolicy="no-referrer" className="viewer-frame" allow="fullscreen; clipboard-write" />;
}

export function VersionPicker({ id, shown, versions }: { id: string; shown: number; versions: { version: number; at: string; note: string | null }[] }) {
  const router = useRouter();
  if (versions.length <= 1) return <span className="num text-[0.8rem] text-muted">v{shown}</span>;
  const latest = versions[0].version;
  return (
    <label className="field">
      <span className="sr-only">Version</span>
      <select
        value={shown}
        onChange={(e) => {
          const v = Number(e.target.value);
          router.push(v === latest ? `/p/${id}` : `/p/${id}?v=${v}`);
        }}
      >
        {versions.map((v) => (
          <option key={v.version} value={v.version}>
            v{v.version} · {when(v.at)}
            {v.note ? ` · ${v.note.slice(0, 40)}` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
