import 'katex/dist/katex.min.css';
import './globals.css';
import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from 'next/font/google';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DrawerProvider, DrawerScrim, MenuButton } from '@/components/Drawer';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { LiveReload } from '@/components/LiveReload';
import { Sidebar, type SidebarTrack } from '@/components/Sidebar';
import { THEME_SCRIPT, ThemeToggle } from '@/components/ThemeToggle';
import { getSite } from '@/lib/content';
import { progressLookup } from '@/lib/db';
import { entryHref } from '@/lib/tracks';

export const dynamic = 'force-dynamic';

const newsreader = Newsreader({
  subsets: ['latin', 'latin-ext'],
  axes: ['opsz'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
  display: 'swap',
});
const plexSans = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-plex-sans',
  display: 'swap',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Marginalia', template: '%s · Marginalia' },
  description: 'The mathematics behind the papers, one page a day.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const site = getSite();
  const statusOf = progressLookup();
  const tracks: SidebarTrack[] = site.tracks.map((t) => ({
    id: t.id,
    name: t.name,
    done: t.pages.filter((p) => statusOf(p.slug) === 'done').length,
    pages: t.pages.map((p) => ({
      href: entryHref(p.kind, p.slug),
      title: p.title,
      status: statusOf(p.slug),
      draft: p.status === 'draft',
    })),
  }));
  const roadmaps = site.roadmaps.map((r) => ({ href: entryHref('roadmap', r.slug), title: r.title }));

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <DrawerProvider>
          <a href="#main" className="sr-only-focusable label absolute left-4 top-2 z-50 bg-surface px-2 py-1">
            Skip to content
          </a>
          <header className="site-header">
            <div className="shell flex h-full items-center gap-3 sm:gap-5">
              <MenuButton />
              <Link href="/" className="font-display text-[1.2rem] text-ink no-underline sm:text-[1.35rem]">
                Marginalia
              </Link>
              <nav className="flex items-center gap-3 text-[0.92rem] sm:gap-4">
                <Link href="/library" className="text-muted no-underline hover:text-ink">
                  Library
                </Link>
                <Link href="/roadmaps" className="text-muted no-underline hover:text-ink">
                  Roadmaps
                </Link>
              </nav>
              <div className="ml-auto flex items-center gap-3 sm:gap-4">
                <LiveReload />
                <ThemeToggle />
              </div>
            </div>
          </header>
          <div className="shell shell-grid">
            <Sidebar tracks={tracks} roadmaps={roadmaps} />
            <DrawerScrim />
            <main id="main" className="min-w-0">
              {children}
            </main>
          </div>
          <KeyboardShortcuts />
        </DrawerProvider>
      </body>
    </html>
  );
}
