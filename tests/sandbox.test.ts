import { describe, expect, it } from 'vitest';
import { signContentToken, verifyContentToken } from '@/lib/content-token';
import { blockedResources, contentHeaders, contentSecurityPolicy, DEFAULT_CDN_HOSTS, isCdnHost, parseCdnHosts } from '@/lib/sandbox';

describe('content security policy', () => {
  it('sandboxes without same-origin and allows only this server and the listed hosts', () => {
    const csp = contentSecurityPolicy(['cdn.jsdelivr.net', '*.example.com'], { siteOrigin: 'https://site.example' });
    expect(csp).toMatch(/^sandbox allow-scripts /);
    expect(csp).not.toContain('allow-same-origin');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toMatch(/script-src 'self' [^;]*https:\/\/cdn\.jsdelivr\.net https:\/\/\*\.example\.com/);
    expect(csp).toMatch(/connect-src 'self' [^;]*https:\/\/cdn\.jsdelivr\.net/);
    expect(csp).not.toMatch(/https?:\s|\*\s|'unsafe-hashes'|http:\/\//);
    expect(csp).toContain("frame-ancestors 'self' https://site.example");
  });

  it('lets a page frame its own HTML files, but only the site frame the page', () => {
    expect(contentSecurityPolicy([], { entry: false })).not.toContain('frame-ancestors');
    expect(contentSecurityPolicy([], { entry: false })).toMatch(/^sandbox allow-scripts /);
  });

  it('drops anything that is not a host name, so a setting cannot widen the policy', () => {
    const csp = contentSecurityPolicy(['cdn.jsdelivr.net', "'unsafe-inline'; img-src *", '*', 'https:']);
    expect(csp).not.toContain('img-src *');
    expect(csp.match(/https:\/\//g)?.length).toBe(8); // one host in each of 8 directives
  });

  it('parses admin input', () => {
    expect(parseCdnHosts('https://cdn.jsdelivr.net/\nunpkg.com, UNPKG.com  *.example.org localhost:8080 javascript:alert(1) *')).toEqual({
      hosts: ['cdn.jsdelivr.net', 'unpkg.com', '*.example.org'],
      invalid: ['localhost:8080', 'javascript:alert(1)', '*'],
    });
    for (const h of DEFAULT_CDN_HOSTS) expect(isCdnHost(h)).toBe(true);
  });

  it('sends the policy with every content response', () => {
    const h = contentHeaders('.js', ['unpkg.com']);
    expect(h['Content-Type']).toBe('text/javascript; charset=utf-8');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Content-Security-Policy']).toContain('https://unpkg.com');
  });

  it('reports references to hosts the policy blocks', () => {
    const page = `
      <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
      <script src="https://evil.example/x.js"></script>
      <link rel="stylesheet" href="//fonts.googleapis.com/css2?family=Inter">
      <img src="http://cdn.jsdelivr.net/insecure.png">
      <script type="module">import * as THREE from 'https://esm.sh/three'; import x from "https://bad.example/m.js";</script>`;
    expect(blockedResources(page, DEFAULT_CDN_HOSTS)).toEqual(['https://evil.example/x.js', 'http://cdn.jsdelivr.net/insecure.png', 'https://bad.example/m.js']);
  });
});

describe('content tokens', () => {
  const now = Date.UTC(2026, 10, 23, 12, 3);
  it('verifies for the page it was signed for, until it expires', () => {
    const t = signContentToken('s', 'AbCdEfGhIjKl', now);
    expect(verifyContentToken('s', 'AbCdEfGhIjKl', t, now)).toBe(true);
    expect(verifyContentToken('s', 'AbCdEfGhIjKl', t, now + 2 * 3600_000)).toBe(true);
    expect(verifyContentToken('s', 'AbCdEfGhIjKl', t, now + 3 * 3600_000)).toBe(false);
    expect(verifyContentToken('s', 'OtherPage123', t, now)).toBe(false);
    expect(verifyContentToken('other secret', 'AbCdEfGhIjKl', t, now)).toBe(false);
  });

  it('stays the same within a 10-minute step, so frame URLs are stable', () => {
    expect(signContentToken('s', 'p', now)).toBe(signContentToken('s', 'p', now + 60_000));
  });

  it('rejects tokens claiming an expiry beyond the lifetime', () => {
    const far = now + 100 * 3600_000;
    const forged = signContentToken('s', 'p', far);
    expect(verifyContentToken('s', 'p', forged, now)).toBe(false);
  });
});
