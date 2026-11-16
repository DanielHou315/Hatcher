'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

let focusSearchOnMount = false;

/** Called by the library search box on mount; true once after `/` was pressed elsewhere. */
export function consumeSearchFocusRequest(): boolean {
  const v = focusSearchOnMount;
  focusSearchOnMount = false;
  return v;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** `/` focuses the library search; `[` and `]` go to prev/next in roadmap order. */
export function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === '/') {
        e.preventDefault();
        const input = document.getElementById('library-search');
        if (input) input.focus();
        else {
          focusSearchOnMount = true;
          router.push('/library');
        }
      } else if (e.key === '[' || e.key === ']') {
        const link = document.querySelector<HTMLAnchorElement>(`a[data-nav="${e.key === '[' ? 'prev' : 'next'}"]`);
        if (link) {
          e.preventDefault();
          router.push(link.getAttribute('href')!);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, pathname]);

  return null;
}
