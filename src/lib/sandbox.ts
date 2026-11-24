// Serving untrusted page code. Pages run in sandboxed frames with an opaque origin, under a
// Content-Security-Policy that allows this server plus the CDN hosts an admin has approved.
// See docs/architecture.md, "Sandboxed pages".

/** URL prefix of the content route (`src/app/c/[...path]/route.ts`). */
export const CONTENT_PREFIX = '/c';

/** File types a page may contain and the content route serves, by extension. */
export const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
};

export const TEXT_EXTS = new Set(['.html', '.htm', '.js', '.mjs', '.css', '.json', '.csv', '.tsv', '.txt', '.md', '.xml', '.svg', '.gltf']);

/** CDN hosts pages may load code, styles, fonts and data from, until an admin changes the list. */
export const DEFAULT_CDN_HOSTS = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'esm.sh',
  'cdn.tailwindcss.com',
  'code.jquery.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

const HOST_RE = /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(:\d{1,5})?$/;

/** A CDN host as an admin may enter it: a hostname, optionally `*.` and `:port`. No scheme, path or wildcards elsewhere. */
export function isCdnHost(host: string): boolean {
  return HOST_RE.test(host);
}

/** Normalise a list of hosts (one per line or comma-separated); returns the valid ones and the rejected ones. */
export function parseCdnHosts(input: string | string[]): { hosts: string[]; invalid: string[] } {
  const items = (Array.isArray(input) ? input : input.split(/[\s,]+/))
    .map((h) => h.trim().toLowerCase().replace(/^https:\/\//, '').replace(/\/+$/, ''))
    .filter(Boolean);
  const hosts = [...new Set(items.filter(isCdnHost))];
  return { hosts, invalid: items.filter((h) => !isCdnHost(h)) };
}

/** Origin that serves sandboxed content, e.g. https://hatcher-content.example.com. Empty: same origin. */
export function contentOrigin(): string {
  return (process.env.CONTENT_ORIGIN ?? '').replace(/\/+$/, '');
}

/**
 * The `sandbox` attribute for frames. No allow-same-origin: page code always gets an opaque origin.
 * Popups (links opening a new tab) stay sandboxed. No modals (a prompt() could pose as the site)
 * and no downloads (a page could hand out any file under the site's name).
 */
export const FRAME_SANDBOX = 'allow-scripts allow-popups allow-forms';

/**
 * Policy for everything under the content route. `sandbox` applies even when a URL is opened
 * directly, so page code never runs with the site's origin. Code may load from this server and the
 * approved CDN hosts only, and may send data nowhere else.
 */
export function contentSecurityPolicy(cdnHosts: string[], opts: { entry?: boolean; siteOrigin?: string } = {}): string {
  const { entry = true, siteOrigin = process.env.SITE_ORIGIN ?? '' } = opts;
  const cdn = cdnHosts.filter(isCdnHost).map((h) => `https://${h}`).join(' ');
  const src = (...extra: string[]) => ["'self'", ...extra, cdn].filter(Boolean).join(' ');
  return [
    `sandbox ${FRAME_SANDBOX}`,
    "default-src 'none'",
    `script-src ${src("'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'", 'blob:')}`,
    `style-src ${src("'unsafe-inline'")}`,
    `img-src ${src('data:', 'blob:')}`,
    `media-src ${src('data:', 'blob:')}`,
    `font-src ${src('data:')}`,
    `connect-src ${src('data:', 'blob:')}`,
    `worker-src ${src('blob:')}`,
    `frame-src ${src('blob:', 'data:')}`,
    "form-action 'none'",
    "base-uri 'self'",
    // The page itself may only be framed by the site. Other HTML files are framed by the page,
    // whose origin is opaque and matches no source, so they cannot carry this restriction.
    ...(entry ? [`frame-ancestors 'self'${siteOrigin ? ` ${siteOrigin.replace(/\/+$/, '')}` : ''}`] : []),
  ].join('; ');
}

/** `entry`: the page's own index.html, which only the site may frame. */
export function contentHeaders(ext: string, cdnHosts: string[], entry = true): Record<string, string> {
  return {
    'Content-Type': CONTENT_TYPES[ext] ?? 'text/plain; charset=utf-8',
    'Content-Security-Policy': contentSecurityPolicy(cdnHosts, { entry }),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), usb=(), serial=(), hid=(), payment=(), display-capture=()',
    // Sandboxed documents have an opaque origin, so their module scripts and fetches are CORS requests.
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    // Versions never change, but the URL's token does, so a private cache for a while is enough.
    'Cache-Control': 'private, max-age=3600',
  };
}

/** Policy for the site's own pages: framed by nothing else, and framing only page content. */
export function appSecurityHeaders(): Record<string, string> {
  return {
    // frame-src also covers navigations inside the viewer's frame: a page cannot swap itself for
    // another site (to show a fake sign-in, or carry data out in the URL).
    'Content-Security-Policy': `frame-src 'self'${contentOrigin() ? ` ${contentOrigin()}` : ''}; frame-ancestors 'self'; base-uri 'self'; form-action 'self'`,
    'X-Frame-Options': 'SAMEORIGIN',
  };
}

/** URL of the folder a page version's files are served from, ending in a slash. */
export function pageContentBase(id: string, version: number, token: string): string {
  return `${contentOrigin()}${CONTENT_PREFIX}/~${token}/${id}/${version}/`;
}

/** Resources a page references on hosts the policy does not allow, to warn whoever wrote it. */
export function blockedResources(html: string, cdnHosts: string[]): string[] {
  const allowed = (url: string) => {
    let host: string;
    try {
      const u = new URL(url.startsWith('//') ? `https:${url}` : url);
      if (u.protocol !== 'https:') return false;
      host = u.host;
    } catch {
      return false;
    }
    return cdnHosts.some((h) => (h.startsWith('*.') ? host.endsWith(h.slice(1)) : host === h));
  };
  const found = new Set<string>();
  for (const m of html.matchAll(/<(?:script|link|img|iframe|source|video|audio)\b[^>]*?\b(?:src|href)\s*=\s*["']((?:https?:)?\/\/[^"']+)["']/gi)) {
    if (!allowed(m[1])) found.add(m[1]);
  }
  for (const m of html.matchAll(/(?:@import\s+(?:url\()?|\bfrom\s+|\bimport\s*\(\s*)["']((?:https?:)?\/\/[^"')\s]+)/gi)) {
    if (!allowed(m[1])) found.add(m[1]);
  }
  return [...found];
}
