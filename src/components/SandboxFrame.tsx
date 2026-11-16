'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

// Messages from the frame helper (public/_lib/hatcher.js). The frame's origin is opaque ("null"),
// so a message is trusted only by its source window, never by event.origin.
type FrameMessage =
  | { type: 'hatcher:ready' }
  | { type: 'hatcher:resize'; height: number }
  | { type: 'hatcher:anchor'; id: string; top: number }
  | { type: 'hatcher:navigate'; href: string };

const MAX_HEIGHT = 100_000;

/** Internal site paths a frame may ask the page to open. */
function isSitePath(href: string): boolean {
  return /^\/(?![/\\])/.test(href) && !href.startsWith('/c/') && !href.startsWith('/_lib/') && !href.startsWith('/api/');
}

function themeOf(): string {
  return document.documentElement.getAttribute('data-theme') ?? 'system';
}

export function SandboxFrame({
  src,
  title,
  sandbox,
  initialHeight,
  page = false,
}: {
  src: string;
  title: string;
  sandbox: string;
  initialHeight: number;
  /** The frame holds the whole page body: it also answers table-of-contents links. */
  page?: boolean;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(initialHeight);
  const router = useRouter();

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const send = (message: object) => frame.contentWindow?.postMessage(message, '*');
    const sendTheme = () => send({ type: 'hatcher:theme', theme: themeOf() });
    const scrollToAnchor = (id: string) => send({ type: 'hatcher:scroll-to', id });
    let jumpedToHash = false;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      const data = event.data as FrameMessage | undefined;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'hatcher:ready') {
        sendTheme();
        if (page && !jumpedToHash && location.hash.length > 1) {
          jumpedToHash = true;
          scrollToAnchor(decodeURIComponent(location.hash.slice(1)));
        }
      } else if (data.type === 'hatcher:resize' && Number.isFinite(data.height) && data.height > 0) {
        setHeight(Math.min(Math.ceil(data.height), MAX_HEIGHT));
      } else if (data.type === 'hatcher:anchor' && Number.isFinite(data.top)) {
        const header = parseFloat(getComputedStyle(document.documentElement).fontSize) * 3.5 + 16;
        window.scrollTo({ top: frame.getBoundingClientRect().top + window.scrollY + data.top - header, behavior: 'smooth' });
        if (page && typeof data.id === 'string') history.replaceState(history.state, '', `#${encodeURIComponent(data.id)}`);
      } else if (data.type === 'hatcher:navigate' && typeof data.href === 'string' && isSitePath(data.href)) {
        router.push(data.href);
      }
    };

    // Table-of-contents links point at ids inside the frame; forward them instead of jumping nowhere.
    const onClick = (event: MouseEvent) => {
      if (!page || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
      const link = (event.target as Element | null)?.closest?.('a[href^="#"]');
      const id = link ? decodeURIComponent(link.getAttribute('href')!.slice(1)) : '';
      if (!id || document.getElementById(id)) return;
      event.preventDefault();
      scrollToAnchor(id);
    };

    const themeObserver = new MutationObserver(sendTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    // The frame may have loaded before this effect ran; ask it to repeat its size and readiness.
    const hello = () => send({ type: 'hatcher:hello' });
    window.addEventListener('message', onMessage);
    document.addEventListener('click', onClick);
    frame.addEventListener('load', hello);
    hello();
    return () => {
      frame.removeEventListener('load', hello);
      themeObserver.disconnect();
      window.removeEventListener('message', onMessage);
      document.removeEventListener('click', onClick);
    };
  }, [page, router]);

  return (
    <iframe
      ref={ref}
      src={src}
      title={title}
      sandbox={sandbox}
      loading={page ? 'eager' : 'lazy'}
      referrerPolicy="no-referrer"
      className="sandbox-frame"
      style={{ height }}
    />
  );
}
