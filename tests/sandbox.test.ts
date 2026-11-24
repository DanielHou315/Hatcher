import { describe, expect, it } from 'vitest';
import { signContentToken, verifyContentToken } from '@/lib/content-token';
import { blockedResources, FRAME_SANDBOX, contentHeaders, contentSecurityPolicy, DEFAULT_CDN_HOSTS, isCdnHost, parseCdnHosts } from '@/lib/sandbox';

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
  const page = 'AbCdEfGhIjKl';
  it('names the user and is valid only for the page version it was signed for, until it expires', () => {
    const t = signContentToken('s', page, 2, 'user1', now);
    expect(verifyContentToken('s', page, 2, t, now)).toBe('user1');
    expect(verifyContentToken('s', page, 2, t, now + 2 * 3600_000)).toBe('user1');
    expect(verifyContentToken('s', page, 2, t, now + 3 * 3600_000)).toBeNull();
    expect(verifyContentToken('s', 'OtherPage123', 2, t, now)).toBeNull();
    expect(verifyContentToken('s', page, 3, t, now)).toBeNull();
    expect(verifyContentToken('other secret', page, 2, t, now)).toBeNull();
  });

  it('cannot be moved to another user', () => {
    const t = signContentToken('s', page, 1, 'user1', now);
    const [, exp, sig] = t.split('.');
    expect(verifyContentToken('s', page, 1, `user2.${exp}.${sig}`, now)).toBeNull();
  });

  it('stays the same within a 10-minute step, so frame URLs are stable', () => {
    expect(signContentToken('s', 'p', 1, 'u', now)).toBe(signContentToken('s', 'p', 1, 'u', now + 60_000));
  });

  it('rejects tokens claiming an expiry beyond the lifetime', () => {
    const forged = signContentToken('s', 'p', 1, 'u', now + 100 * 3600_000);
    expect(verifyContentToken('s', 'p', 1, forged, now)).toBeNull();
  });
});

describe('sandbox flags', () => {
  it('never lets pages escape the sandbox, show dialogs or start downloads', () => {
    for (const flag of ['allow-same-origin', 'allow-popups-to-escape-sandbox', 'allow-modals', 'allow-downloads', 'allow-top-navigation']) {
      expect(FRAME_SANDBOX).not.toContain(flag);
    }
  });
});
