import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from './helpers';
import { checkFilePath, commitStaged, deletePage, discardStaged, readPage, setStatus, stagePage, type WriteRequest } from '@/lib/page-store';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hatcher-store-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

async function write(req: WriteRequest) {
  const staged = await stagePage(dir, req);
  if (staged.problems.errors.length) {
    discardStaged(staged);
    return staged;
  }
  commitStaged(staged);
  return staged;
}

const stagingEmpty = () => fs.readdirSync(path.join(dir, '.staging')).length === 0;

describe('page store', () => {
  it('creates a page folder and reports a content version', async () => {
    const staged = await write({ kind: 'concept', slug: 'alpha', files: [{ path: 'index.mdx', text: page('Alpha') }] });
    expect(staged.problems.errors).toEqual([]);
    const snap = readPage(dir, 'concept', 'alpha');
    expect(snap.loc.layout).toBe('folder');
    expect(snap.entry.title).toBe('Alpha');
    expect(snap.version).toBe(staged.version);
    expect(stagingEmpty()).toBe(true);
  });

  it('requires the current version to change an existing page', async () => {
    await write({ kind: 'concept', slug: 'alpha', files: [{ path: 'index.mdx', text: page('Alpha') }] });
    const { version } = readPage(dir, 'concept', 'alpha');
    const edit = { kind: 'concept' as const, slug: 'alpha', files: [{ path: 'index.mdx', text: page('Alpha 2') }] };
    await expect(stagePage(dir, edit)).rejects.toThrow(/expected_version/);
    await expect(stagePage(dir, { ...edit, expectedVersion: 'stale' })).rejects.toThrow(/changed since/);
    await write({ ...edit, expectedVersion: version });
    expect(readPage(dir, 'concept', 'alpha').entry.title).toBe('Alpha 2');
  });

  it('leaves the live page untouched when the new version is invalid', async () => {
    await write({ kind: 'concept', slug: 'alpha', files: [{ path: 'index.mdx', text: page('Alpha') }] });
    const before = readPage(dir, 'concept', 'alpha');
    const staged = await write({
      kind: 'concept',
      slug: 'alpha',
      expectedVersion: before.version,
      files: [{ path: 'index.mdx', text: page('Alpha', 'draft', '<script>alert(1)</script>') }],
    });
    expect(staged.problems.errors.join()).toMatch(/not allowed in MDX/);
    expect(readPage(dir, 'concept', 'alpha').version).toBe(before.version);
    expect(stagingEmpty()).toBe(true);
  });

  it('rejects unsafe paths and file types', () => {
    for (const bad of ['../x.mdx', '/etc/passwd', 'a/../../b.html', '.hidden.html', 'figures/.x.js', 'run.sh', 'a\\b.html', 'a/b/c/d/e.html', 'noext']) {
      expect(() => checkFilePath(bad), bad).toThrow();
    }
    expect(checkFilePath('figures/flow.html')).toBe('figures/flow.html');
  });

  it('rejects bad slugs', async () => {
    await expect(stagePage(dir, { kind: 'concept', slug: '../etc', files: [{ path: 'index.mdx', text: 'x' }] })).rejects.toThrow(/slug/);
  });

  it('checks figure references against the staged folder', async () => {
    const body = '## Idea\n\n<Figure src="figures/flow.html" />\n';
    const missing = await write({ kind: 'concept', slug: 'fig', files: [{ path: 'index.mdx', text: page('Fig', 'draft', body) }] });
    expect(missing.problems.errors.join()).toMatch(/file not found/);
    const ok = await write({
      kind: 'concept',
      slug: 'fig',
      files: [
        { path: 'index.mdx', text: page('Fig', 'draft', body) },
        { path: 'figures/flow.html', text: '<canvas></canvas><script src="lib.js"></script>' },
        { path: 'figures/lib.js', text: 'console.log(1)' },
      ],
    });
    expect(ok.problems.errors).toEqual([]);
    expect(readPage(dir, 'concept', 'fig').files.map((f) => f.path)).toEqual(['figures/flow.html', 'figures/lib.js', 'index.mdx']);
  });

  it('switches format and migrates flat pages into folders', async () => {
    fs.mkdirSync(path.join(dir, 'concepts'));
    fs.writeFileSync(path.join(dir, 'concepts/flat.mdx'), page('Flat'));
    const { version } = readPage(dir, 'concept', 'flat');
    const html = page('Flat', 'draft', '<h2 id="a">A</h2>');
    const staged = await write({ kind: 'concept', slug: 'flat', expectedVersion: version, files: [{ path: 'index.html', text: html }] });
    expect(staged.problems.errors).toEqual([]);
    expect(fs.existsSync(path.join(dir, 'concepts/flat.mdx'))).toBe(false);
    expect(fs.readdirSync(path.join(dir, 'concepts/flat'))).toEqual(['index.html']);
  });

  it('enforces size limits and binary uploads', async () => {
    const big = { path: 'big.json', base64: Buffer.alloc(3 * 1024 * 1024).toString('base64') };
    await expect(stagePage(dir, { kind: 'concept', slug: 'big', files: [{ path: 'index.mdx', text: page('Big') }, big] })).rejects.toThrow(/over 2 MB/);
    const png = { path: 'a.png', base64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64') };
    const staged = await write({ kind: 'concept', slug: 'img', files: [{ path: 'index.mdx', text: page('Img') }, png] });
    expect(staged.problems.errors).toEqual([]);
    expect(fs.readFileSync(path.join(dir, 'concepts/img/a.png'))[1]).toBe(0x50);
  });

  it('sets status in place and deletes with the current version', async () => {
    await write({ kind: 'concept', slug: 'alpha', files: [{ path: 'index.mdx', text: page('Alpha') }] });
    const v1 = readPage(dir, 'concept', 'alpha').version;
    const v2 = setStatus(dir, 'concept', 'alpha', 'ready', v1);
    const snap = readPage(dir, 'concept', 'alpha');
    expect(snap.entry.status).toBe('ready');
    expect(snap.source).toBe(page('Alpha', 'ready'));
    expect(() => deletePage(dir, 'concept', 'alpha', v1)).toThrow(/changed since/);
    deletePage(dir, 'concept', 'alpha', v2);
    expect(fs.existsSync(path.join(dir, 'concepts/alpha'))).toBe(false);
  });
});
