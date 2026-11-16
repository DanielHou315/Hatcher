'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { ProgressStatus } from '@/lib/tracks';
import { useDrawer } from './Drawer';
import { StatusDot } from './StatusDot';

export interface SidebarTrack {
  id: string;
  name: string;
  done: number;
  pages: { href: string; title: string; status: ProgressStatus; draft: boolean }[];
}

export function Sidebar({ tracks, roadmaps }: { tracks: SidebarTrack[]; roadmaps: { href: string; title: string }[] }) {
  const pathname = usePathname();
  const { open } = useDrawer();
  const activeTrack = tracks.find((t) => t.pages.some((p) => p.href === pathname))?.id;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const isOpen = (t: SidebarTrack) => expanded[t.id] ?? t.id === activeTrack;

  return (
    <aside id="site-sidebar" className="sidebar" data-open={open} aria-label="Tracks">
      <nav className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <div className="label">Tracks</div>
          <ul className="flex flex-col">
            {tracks.map((t) => {
              const openTrack = isOpen(t);
              return (
                <li key={t.id} className="flex flex-col">
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-baseline justify-between gap-2 py-1.5 text-left hover:text-accent"
                    aria-expanded={openTrack}
                    onClick={() => setExpanded((s) => ({ ...s, [t.id]: !openTrack }))}
                  >
                    <span className={t.id === activeTrack ? 'font-semibold' : ''}>{t.name}</span>
                    <span className="num text-xs text-muted">
                      {t.done}/{t.pages.length}
                    </span>
                  </button>
                  {openTrack && (
                    <ul className="mb-1.5 flex flex-col border-l border-line">
                      {t.pages.length === 0 && <li className="py-1 pl-3 text-sm text-muted">No pages yet</li>}
                      {t.pages.map((p) => (
                        <li key={p.href}>
                          <Link
                            href={p.href}
                            aria-current={p.href === pathname ? 'page' : undefined}
                            className="nav-link flex items-center gap-2 py-1 pr-1 pl-3 text-muted no-underline hover:text-ink"
                          >
                            <StatusDot status={p.status} />
                            <span className="min-w-0 flex-1 leading-snug">{p.title}</span>
                            {p.draft && <span className="pill" data-tone="draft">draft</span>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        {roadmaps.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="label">Roadmaps</div>
            <ul className="flex flex-col">
              {roadmaps.map((r) => (
                <li key={r.href}>
                  <Link
                    href={r.href}
                    aria-current={r.href === pathname ? 'page' : undefined}
                    className="nav-link block py-1 pl-0 text-muted no-underline hover:text-ink"
                  >
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>
    </aside>
  );
}
