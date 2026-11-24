import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { accessTo, canManage, canRead, canWrite } from '@/lib/page-access';
import {
  checkFilePath,
  cleanStaging,
  createPage,
  deletePage,
  isPageId,
  LIMITS,
  newPageId,
  PageError,
  pageFiles,
  readPageFile,
  resolvePageFile,
  restoreVersion,
  setDetails,
  updatePage,
} from '@/lib/pages';
import { file, html, tempEnv, type Env } from './helpers';

let env: Env;
beforeEach(() => {
  env = tempEnv();
});
afterEach(() => env.cleanup());

const alice = { userId: 'alice' };
const bob = { userId: 'bob' };

function create(title = 'Demo') {
  return createPage(env.db, env.dir, alice, { title, description: 'A demo', files: [file('index.html', html('v1')), file('js/app.js', 'let a = 1;')] });
}

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return err instanceof PageError ? err.code : 'other';
  }
}

describe('ids and paths', () => {
  it('makes 12-character base-62 ids', () => {
    const ids = new Set(Array.from({ length: 500 }, newPageId));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(isPageId(id)).toBe(true);
    expect(isPageId('../etc/passwd')).toBe(false);
  });

  it('accepts ordinary relative paths and rejects escapes, hidden files and unknown types', () => {
    expect(checkFilePath('index.html')).toBe('index.html');
    expect(checkFilePath('./assets/My Image.png')).toBe('assets/My Image.png');
    for (const bad of ['../x.html', '/abs.html', 'a/../b.html', '.env', 'a/.git/x.js', 'x.exe', 'noext', 'a//b.js', 'a\\b.js', 'a/b/c/d/e/f/g.js']) {
      expect(code(() => checkFilePath(bad)), bad).toBe('invalid');
    }
  });
});

describe('creating and reading', () => {
  it('stores version 1 with its files and metadata', () => {
    const page = create();
    expect(page.version).toBe(1);
    expect(env.db.page(page.id)?.title).toBe('Demo');
    expect(pageFiles(env.dir, page.id, 1).map((f) => f.path)).toEqual(['index.html', 'js/app.js']);
    expect(readPageFile(env.dir, page.id, 1, 'index.html').toString()).toContain('v1');
    expect(env.db.versions(page.id)).toHaveLength(1);
  });

  it('needs a title and an index.html, and enforces size limits', () => {
    expect(code(() => createPage(env.db, env.dir, alice, { title: '  ', files: [file('index.html', 'x')] }))).toBe('invalid');
    expect(code(() => createPage(env.db, env.dir, alice, { title: 'T', files: [file('main.html', 'x')] }))).toBe('invalid');
    const big = { path: 'big.bin.png', data: Buffer.alloc(LIMITS.fileBytes + 1) };
    expect(code(() => createPage(env.db, env.dir, alice, { title: 'T', files: [file('index.html', 'x'), big] }))).toBe('too_large');
    // Nothing half-made is left behind.
    expect(fs.readdirSync(path.join(env.dir, 'pages')).filter((d) => d !== '.staging')).toEqual([]);
  });

  it('never resolves a file outside the version folder', () => {
    const page = create();
    expect(resolvePageFile(env.dir, page.id, 1, 'js/app.js')).not.toBeNull();
    expect(resolvePageFile(env.dir, page.id, 1, '../2/index.html')).toBeNull();
    expect(resolvePageFile(env.dir, page.id, 1, 'missing.js')).toBeNull();
    expect(resolvePageFile(env.dir, '../../etc', 1, 'passwd.txt')).toBeNull();
    // A symlink inside a page that points out of it is refused.
    fs.symlinkSync('/etc/hostname', path.join(env.dir, 'pages', page.id, '1', 'leak.txt'));
    expect(resolvePageFile(env.dir, page.id, 1, 'leak.txt')).toBeNull();
  });
});

describe('versions', () => {
  it('makes a new version from changes and keeps the old one', () => {
    const page = create();
    const v2 = updatePage(env.db, env.dir, page.id, bob, { expectedVersion: 1, files: [file('index.html', html('v2'))], delete: ['js/app.js'], note: 'rewrite' });
    expect(v2).toBe(2);
    expect(readPageFile(env.dir, page.id, 2, 'index.html').toString()).toContain('v2');
    expect(pageFiles(env.dir, page.id, 2).map((f) => f.path)).toEqual(['index.html']);
    expect(readPageFile(env.dir, page.id, 1, 'index.html').toString()).toContain('v1');
    const [latest] = env.db.versions(page.id);
    expect(latest).toMatchObject({ version: 2, author_id: 'bob', note: 'rewrite', files: 1 });
  });

  it('refuses a change based on an old version', () => {
    const page = create();
    updatePage(env.db, env.dir, page.id, alice, { expectedVersion: 1, files: [file('index.html', html('v2'))] });
    expect(code(() => updatePage(env.db, env.dir, page.id, bob, { expectedVersion: 1, files: [file('index.html', html('lost'))] }))).toBe('conflict');
    expect(env.db.page(page.id)?.version).toBe(2);
  });

  it('refuses to remove index.html or a missing file, and empty changes', () => {
    const page = create();
    expect(code(() => updatePage(env.db, env.dir, page.id, alice, { expectedVersion: 1, delete: ['index.html'] }))).toBe('invalid');
    expect(code(() => updatePage(env.db, env.dir, page.id, alice, { expectedVersion: 1, delete: ['nope.js'] }))).toBe('not_found');
    expect(code(() => updatePage(env.db, env.dir, page.id, alice, { expectedVersion: 1 }))).toBe('invalid');
    expect(env.db.page(page.id)?.version).toBe(1);
  });

  it('restores an earlier version as a new one', () => {
    const page = create();
    updatePage(env.db, env.dir, page.id, alice, { expectedVersion: 1, files: [file('index.html', html('v2'))] });
    expect(restoreVersion(env.db, env.dir, page.id, alice, 1, 2)).toBe(3);
    expect(readPageFile(env.dir, page.id, 3, 'index.html').toString()).toContain('v1');
    expect(env.db.versions(page.id)[0].note).toBe('Restored version 1');
    expect(code(() => restoreVersion(env.db, env.dir, page.id, alice, 9, 3))).toBe('not_found');
  });

  it('renames without making a version', () => {
    const page = create();
    setDetails(env.db, page.id, { title: '  New   name ', description: 'd' });
    expect(env.db.page(page.id)).toMatchObject({ title: 'New name', description: 'd', version: 1 });
  });
});

describe('sharing and access', () => {
  it('gives the owner everything, shares read or write, others nothing', () => {
    const page = create();
    env.db.putShare(page.id, 'bob', 'read', 'alice');
    env.db.putShare(page.id, 'carol', 'write', 'alice');
    const row = env.db.page(page.id)!;
    expect(accessTo(env.db, row, 'alice')).toBe('owner');
    expect(accessTo(env.db, row, 'bob')).toBe('read');
    expect(accessTo(env.db, row, 'carol')).toBe('write');
    expect(accessTo(env.db, row, 'mallory')).toBeNull();
    expect([canRead('read'), canWrite('read'), canWrite('write'), canManage('write'), canManage('owner'), canRead(null)]).toEqual([
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
  });

  it('lists what each user can see', () => {
    const a = create('Mine');
    const b = createPage(env.db, env.dir, bob, { title: 'Bob’s', files: [file('index.html', 'x')] });
    createPage(env.db, env.dir, bob, { title: 'Private', files: [file('index.html', 'x')] });
    env.db.putShare(b.id, 'alice', 'write', 'bob');
    const seen = env.db.visiblePages('alice').map((p) => [p.title, p.access]);
    expect(seen).toEqual(expect.arrayContaining([['Mine', 'owner'], ['Bob’s', 'write']]));
    expect(seen).toHaveLength(2);
    env.db.putShare(b.id, 'alice', 'read', 'bob');
    expect(env.db.visiblePages('alice').find((p) => p.id === b.id)?.access).toBe('read');
    expect(env.db.deleteShare(b.id, 'alice')).toBe(true);
    expect(env.db.visiblePages('alice').map((p) => p.id)).toEqual([a.id]);
  });

  it('deletes a page with its files, versions and shares', () => {
    const page = create();
    env.db.putShare(page.id, 'bob', 'read', 'alice');
    deletePage(env.db, env.dir, page.id);
    expect(env.db.page(page.id)).toBeUndefined();
    expect(env.db.shares(page.id)).toEqual([]);
    expect(env.db.versions(page.id)).toEqual([]);
    expect(fs.existsSync(path.join(env.dir, 'pages', page.id))).toBe(false);
    cleanStaging(env.dir);
  });
});
