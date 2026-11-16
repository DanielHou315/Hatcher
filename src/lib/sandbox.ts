// Serving and framing of untrusted page code: HTML pages and figures run in sandboxed frames.
// See docs/architecture.md, "Sandboxed HTML".
import fs from 'node:fs';
import path from 'node:path';
import type { Entry } from './content';
import type { TocItem } from './mdx-plugins';
import { KIND_DIRS } from './tracks';

/** URL prefix of the content route (`src/app/c/[...path]/route.ts`). */
export const CONTENT_PREFIX = '/c';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** File types the content route serves, by extension. Anything else is a 404. */
export const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
};

/** Origin that serves sandboxed content, e.g. https://hatcher-content.example.com. Empty: same origin. */
export function contentOrigin(): string {
  return (process.env.CONTENT_ORIGIN ?? '').replace(/\/+$/, '');
}

/** The `sandbox` attribute for frames. No allow-same-origin: the frame always gets an opaque origin. */
export const FRAME_SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox';

/**
 * Policy for everything under the content route. `sandbox` applies even when a URL is opened
 * directly, so page code never runs with the site's origin. Code may load only from this server
 * (its own folder and the shared /_lib), and may not send data anywhere else.
 */
export function contentSecurityPolicy(siteOrigin = process.env.SITE_ORIGIN ?? ''): string {
  return [
    `sandbox ${FRAME_SANDBOX}`,
    "default-src 'none'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "form-action 'none'",
    "base-uri 'none'",
    `frame-ancestors 'self'${siteOrigin ? ` ${siteOrigin.replace(/\/+$/, '')}` : ''}`,
  ].join('; ');
}

export function contentHeaders(ext: string): Record<string, string> {
  return {
    'Content-Type': CONTENT_TYPES[ext] ?? 'text/plain; charset=utf-8',
    'Content-Security-Policy': contentSecurityPolicy(),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), usb=(), serial=(), hid=(), payment=(), display-capture=()',
    // Sandboxed documents have an opaque origin, so their module scripts and fetches are CORS requests.
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cache-Control': 'no-cache',
  };
}

export interface ContentHit {
  file: string;
  ext: string;
  /** The page's own HTML document, whose frontmatter is stripped before serving. */
  entryDoc: boolean;
}

function within(root: string, file: string): boolean {
  try {
    const realRoot = fs.realpathSync(root);
    const realFile = fs.realpathSync(file);
    return realFile.startsWith(realRoot + path.sep) && fs.statSync(realFile).isFile();
  } catch {
    return false;
  }
}

/**
 * Map `/c/<kind dir>/<slug>/<path...>` to a file. `<path>` = `index.html` is the page's HTML
 * document (a page folder's index.html, or a flat `<slug>.html`); anything else is a file inside
 * the page folder. Returns null for anything outside a page folder, hidden, or of an unlisted type.
 */
export function resolveContentPath(dir: string, segments: string[]): ContentHit | null {
  const [kindDir, slug, ...rest] = segments;
  if (!kindDir || !slug || rest.length === 0) return null;
  if (!Object.values(KIND_DIRS).includes(kindDir) || !SLUG_RE.test(slug)) return null;
  if (rest.some((s) => !s || s.startsWith('.') || s.includes('/') || s.includes('\\'))) return null;

  const kindAbs = path.join(dir, kindDir);
  const bundleDir = path.join(kindAbs, slug);
  if (rest.length === 1 && rest[0] === 'index.html') {
    const inBundle = path.join(bundleDir, 'index.html');
    if (within(bundleDir, inBundle)) return { file: inBundle, ext: '.html', entryDoc: true };
    const flat = path.join(kindAbs, `${slug}.html`);
    if (within(kindAbs, flat)) return { file: flat, ext: '.html', entryDoc: true };
    return null;
  }
  const ext = path.extname(rest[rest.length - 1]).toLowerCase();
  if (!CONTENT_TYPES[ext]) return null;
  const file = path.join(bundleDir, ...rest);
  return within(bundleDir, file) ? { file, ext, entryDoc: false } : null;
}

const FRONTMATTER_RE = /^﻿?---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

/** Shared stylesheet and helper every sandboxed document gets, ahead of its own styles. */
export const HELPER_TAGS = '<link rel="stylesheet" href="/_lib/hatcher.css"><script src="/_lib/hatcher.js"></script>';

/**
 * Prepare an HTML file for serving: drop frontmatter (page documents), then inject the helper.
 * A fragment without <html> or <head> is wrapped into a full document.
 */
export function prepareHtml(source: string, opts: { stripFrontmatter: boolean }): string {
  const html = opts.stripFrontmatter ? source.replace(FRONTMATTER_RE, '') : source;
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + HELPER_TAGS + html.slice(head.index + head[0].length);
  const root = /<html(\s[^>]*)?>/i.exec(html);
  if (root) return html.slice(0, root.index + root[0].length) + `<head>${HELPER_TAGS}</head>` + html.slice(root.index + root[0].length);
  return (
    '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1">' +
    `${HELPER_TAGS}</head><body>${html}</body></html>`
  );
}

/** A figure path inside the page folder: relative, no `..`, no hidden segments, ending in .html. */
export function isFigurePath(src: string): boolean {
  return /^(?!\/)[\w./-]+\.html$/.test(src) && src.split('/').every((s) => s !== '' && !s.startsWith('.'));
}

/** URL of the folder a page's sandboxed files are served from, ending in a slash. */
export function entryContentBase(entry: Pick<Entry, 'kind' | 'slug'>): string {
  return `${contentOrigin()}${CONTENT_PREFIX}/${KIND_DIRS[entry.kind]}/${entry.slug}/`;
}

/** Latest modification time in the page's folder (or of its file), used to reload frames on change. */
export function entryVersion(entry: Pick<Entry, 'file' | 'bundle'>): string {
  let latest = 0;
  const files = entry.bundle ? listFiles(path.dirname(entry.file)) : [entry.file];
  for (const f of files) {
    try {
      latest = Math.max(latest, fs.statSync(f).mtimeMs);
    } catch {
      // removed while listing
    }
  }
  return Math.floor(latest).toString(36);
}

function listFiles(root: string, limit = 2000): string[] {
  try {
    return fs
      .readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile())
      .slice(0, limit)
      .map((d) => path.join(d.parentPath, d.name));
  } catch {
    return [];
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

/** h2/h3 headings with an id, in order, for an HTML page's table of contents. */
export function extractHtmlToc(html: string): TocItem[] {
  const out: TocItem[] = [];
  for (const m of html.matchAll(/<h([23])\b([^>]*)>([\s\S]*?)<\/h\1\s*>/gi)) {
    const id = /\bid\s*=\s*(?:"([^"]+)"|'([^']+)')/i.exec(m[2]);
    if (!id) continue;
    const text = m[3]
      .replace(/<[^>]+>/g, '')
      .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTITIES[e])
      .replace(/\s+/g, ' ')
      .trim();
    out.push({ depth: m[1] === '2' ? 2 : 3, id: id[1] ?? id[2], text });
  }
  return out;
}

/** Resources a sandboxed document references on another host. The policy blocks them, so report them. */
export function externalResources(html: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(/<(script|link|img|iframe|source|video|audio)\b[^>]*?\b(?:src|href)\s*=\s*["']((?:https?:)?\/\/[^"']+)["']/gi)) {
    found.add(m[2]);
  }
  for (const m of html.matchAll(/@import\s+(?:url\()?["']?((?:https?:)?\/\/[^"')\s]+)/gi)) found.add(m[1]);
  return [...found];
}
