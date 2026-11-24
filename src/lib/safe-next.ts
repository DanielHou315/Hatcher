/**
 * Where to go after signing in: a path on this site, or '/'. Refuses anything a browser could read
 * as another site, including tricks like "/\\evil.com" or "/%09/evil.com" (browsers drop tabs and
 * newlines in URLs, which turns "/\t/evil.com" into "//evil.com").
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || /[\u0000-\u001f\u007f\s\\]/.test(next)) return '/';
  try {
    const url = new URL(next, 'http://hatcher.invalid');
    return url.origin === 'http://hatcher.invalid' && !next.startsWith('//') ? url.pathname + url.search + url.hash : '/';
  } catch {
    return '/';
  }
}
