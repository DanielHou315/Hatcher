import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEntries } from '@/lib/content';
import {
  contentSecurityPolicy,
  externalResources,
  extractHtmlToc,
  isFigurePath,
  prepareHtml,
  resolveContentPath,
} from '@/lib/sandbox';

const dir = path.join(__dirname, 'fixtures/formats');
const entries = loadEntries(dir);
const get = (slug: string) => entries.find((e) => e.slug === slug)!;
const rel = (hit: ReturnType<typeof resolveContentPath>) => (hit ? path.relative(dir, hit.file) : null);

describe('entry layouts', () => {
  it('loads flat HTML, page folders, and skips hidden files', () => {
    expect(entries.map((e) => e.slug).sort()).toEqual(['bundle-html', 'bundle-paper', 'dup', 'flat-html']);
    expect(get('flat-html')).toMatchObject({ format: 'html', bundle: false, title: 'Flat HTML', level: 1 });
    expect(get('bundle-html')).toMatchObject({ format: 'html', bundle: true, relPath: 'concepts/bundle-html/index.html' });
    expect(get('bundle-paper')).toMatchObject({ format: 'mdx', bundle: true, kind: 'paper' });
    expect(get('flat-html').body.trimStart().startsWith('<h2')).toBe(true);
  });

  it('flags a slug used by both a file and a folder', () => {
    const error = get('dup').error!;
    expect(error).toMatch(/slug "dup" is also used by/);
    expect(error).toContain('concepts/dup.mdx');
    expect(error).toContain('concepts/dup/index.html');
  });
});

describe('content route paths', () => {
  it('serves a page document from a folder or a flat file', () => {
    expect(rel(resolveContentPath(dir, ['concepts', 'bundle-html', 'index.html']))).toBe('concepts/bundle-html/index.html');
    expect(rel(resolveContentPath(dir, ['concepts', 'flat-html', 'index.html']))).toBe('concepts/flat-html.html');
    expect(resolveContentPath(dir, ['concepts', 'flat-html', 'index.html'])?.entryDoc).toBe(true);
  });

  it('serves listed file types inside a page folder', () => {
    expect(rel(resolveContentPath(dir, ['papers', 'bundle-paper', 'figures', 'flow.html']))).toBe('papers/bundle-paper/figures/flow.html');
    expect(resolveContentPath(dir, ['papers', 'bundle-paper', 'figures', 'data.json'])?.entryDoc).toBe(false);
  });

  it('refuses sources, hidden files, unlisted types, traversal, and unknown kinds', () => {
    const refused = [
      ['papers', 'bundle-paper', 'index.mdx'],
      ['papers', 'bundle-paper', '.private.json'],
      ['papers', 'bundle-paper', 'figures', 'run.sh'],
      ['papers', 'bundle-paper', '..', 'bundle-paper', 'index.mdx'],
      ['papers', '..', 'concepts', 'flat-html.html'],
      ['concepts', 'flat-html.html'],
      ['secrets', 'bundle-paper', 'index.html'],
      ['papers', 'Bundle-Paper', 'index.html'],
      ['concepts', 'missing', 'index.html'],
    ];
    for (const segments of refused) expect(resolveContentPath(dir, segments), segments.join('/')).toBeNull();
  });
});

describe('html preparation', () => {
  it('strips frontmatter from page documents and injects the helper into <head>', () => {
    const out = prepareHtml('---\ntitle: x\n---\n<html><head><title>t</title></head><body>b</body></html>', { stripFrontmatter: true });
    expect(out.startsWith('<html><head><link rel="stylesheet" href="/_lib/hatcher.css"><script src="/_lib/hatcher.js"></script><title>')).toBe(true);
  });

  it('wraps fragments in a full document', () => {
    const out = prepareHtml('<p>hi</p>', { stripFrontmatter: false });
    expect(out).toMatch(/^<!doctype html><html lang="en"><head>.*hatcher\.js.*<\/head><body><p>hi<\/p><\/body><\/html>$/);
  });

  it('keeps frontmatter-like text in figures', () => {
    expect(prepareHtml('---\na\n---\n<p>x</p>', { stripFrontmatter: false })).toContain('---\na\n---');
  });
});

describe('policy and checks', () => {
  it('sandboxes every response and blocks outside hosts', () => {
    const csp = contentSecurityPolicy('https://site.example/');
    expect(csp).toMatch(/^sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox;/);
    expect(csp).not.toContain('allow-same-origin');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'self';");
    expect(csp).toContain("frame-ancestors 'self' https://site.example");
  });

  it('builds a table of contents from headings with ids', () => {
    expect(extractHtmlToc(get('flat-html').body)).toEqual([
      { depth: 2, id: 'setup', text: 'Setup & notation' },
      { depth: 3, id: 'detail', text: 'A detail' },
    ]);
  });

  it('finds resources loaded from other hosts', () => {
    expect(externalResources('<script src="https://cdn.x/d3.js"></script><img src="//a.b/c.png"><a href="https://ok.link">l</a><script src="main.js"></script>')).toEqual([
      'https://cdn.x/d3.js',
      '//a.b/c.png',
    ]);
  });

  it('accepts only relative .html figure paths', () => {
    expect(isFigurePath('figures/flow.html')).toBe(true);
    for (const bad of ['/figures/flow.html', '../x.html', 'figures/../x.html', 'figures/.x.html', 'flow.js', 'a//b.html']) {
      expect(isFigurePath(bad), bad).toBe(false);
    }
  });
});
