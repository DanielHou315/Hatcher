import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { keyActions } from '@/lib/agent-auth';
import * as api from '@/lib/page-api';
import { createPage, PageError } from '@/lib/pages';
import { DEFAULT_CDN_HOSTS } from '@/lib/sandbox';
import { file, html, tempEnv, type Env } from './helpers';

let env: Env;
beforeEach(() => {
  env = tempEnv();
});
afterEach(() => env.cleanup());

const READ: api.Action[] = ['read'];
const WRITE: api.Action[] = ['read', 'write'];

function ctx(userId: string, actions: api.Action[], keyId: string | undefined = 'k1'): api.ApiContext {
  return { db: env.db, dataDir: env.dir, baseURL: 'https://hatcher.example', cdnHosts: DEFAULT_CDN_HOSTS, who: { userId, keyId, actions } };
}

const text = (path: string, t: string) => api.decodeFiles([{ path, text: t }]);

/** The PageError code a call fails with. */
function code(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof PageError) return err.code;
    throw err;
  }
  return 'ok';
}

function seed() {
  const mine = createPage(env.db, env.dir, { userId: 'alice' }, { title: 'Mine', files: [file('index.html', html('mine'))] });
  const shared = createPage(env.db, env.dir, { userId: 'bob' }, { title: 'Shared', files: [file('index.html', html('shared'))] });
  const hidden = createPage(env.db, env.dir, { userId: 'bob' }, { title: 'Hidden', files: [file('index.html', html('hidden'))] });
  env.db.putShare(shared.id, 'alice', 'read', 'bob');
  return { mine, shared, hidden };
}

describe('key access', () => {
  it('reads read and write from stored permissions, dropping 0.1 publish and unknown values', () => {
    expect(keyActions({ pages: ['read', 'write', 'publish'] })).toEqual(['read', 'write']);
    expect(keyActions('{"pages":["read"]}')).toEqual(['read']);
    expect(keyActions({ pages: ['delete-everything'] })).toEqual([]);
    expect(keyActions('not json')).toEqual([]);
    expect(keyActions(null)).toEqual([]);
  });
});

describe('page API', () => {
  it('lists and reads only what the caller may see', () => {
    const { mine, shared, hidden } = seed();
    const c = ctx('alice', READ);
    const list = api.listPages(c);
    expect(list.map((p) => [p.title, p.access])).toEqual(
      expect.arrayContaining([
        ['Mine', 'owner'],
        ['Shared', 'read'],
      ]),
    );
    expect(list).toHaveLength(2);
    expect(api.listPages(c, 'shar').map((p) => p.title)).toEqual(['Shared']);
    const got = api.getPage(c, shared.id);
    expect(got.url).toBe(`https://hatcher.example/p/${shared.id}`);
    expect(got.files.map((f) => f.path)).toEqual(['index.html']);
    expect(code(() => api.getPage(c, hidden.id))).toBe('not_found');
    expect(api.readFile(c, mine.id, 'index.html').text).toContain('mine');
    expect(code(() => api.getPage(c, mine.id, 2))).toBe('not_found');
  });

  it('returns binary files as base64', () => {
    const c = ctx('alice', WRITE);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const page = api.create(c, { title: 'Img', files: [...text('index.html', html('<img src="a.png">')), { path: 'a.png', data: png }] });
    const f = api.readFile(c, page.id, 'a.png');
    expect(f.base64).toBe(png.toString('base64'));
    expect(f).not.toHaveProperty('text');
  });

  it('refuses writes with a read-only key', () => {
    seed();
    const c = ctx('alice', READ);
    expect(code(() => api.create(c, { title: 'X', files: text('index.html', 'x') }))).toBe('forbidden');
  });

  it('creates, updates with version checks, and restores', () => {
    const c = ctx('alice', WRITE);
    const created = api.create(c, {
      title: 'Chart',
      files: text('index.html', html('<script src="https://cdn.jsdelivr.net/npm/d3@7"></script><script src="https://evil.example/x.js"></script>')),
    });
    expect(created.version).toBe(1);
    expect(created.warnings.join(' ')).toContain('https://evil.example/x.js');
    expect(created.warnings.join(' ')).not.toContain('jsdelivr');
    const id = created.id;

    expect(api.update(c, id, { expectedVersion: 1, files: text('data.json', '[1,2]'), note: 'data' }).version).toBe(2);
    expect(code(() => api.update(c, id, { expectedVersion: 1, files: text('data.json', '[]') }))).toBe('conflict');
    expect(api.listVersions(c, id).map((v) => v.version)).toEqual([2, 1]);
    expect(api.restore(c, id, 1, 2).version).toBe(3);
    expect(api.getPage(c, id).files.map((f) => f.path)).toEqual(['index.html']);
    expect(api.getPage(c, id, 2).files.map((f) => f.path)).toEqual(['index.html', 'data.json']);
  });

  it('lets editors change content but not rename or delete, and refuses read-only shares', () => {
    const { shared } = seed();
    const c = ctx('alice', WRITE);
    expect(code(() => api.update(c, shared.id, { expectedVersion: 1, files: text('index.html', 'x') }))).toBe('forbidden');
    env.db.putShare(shared.id, 'alice', 'write', 'bob');
    expect(api.update(c, shared.id, { expectedVersion: 1, files: text('index.html', 'x') }).version).toBe(2);
    expect(code(() => api.rename(c, shared.id, { title: 'Mine now' }))).toBe('forbidden');
    expect(code(() => api.remove(c, shared.id))).toBe('forbidden');
  });

  it('lets owners rename and delete', () => {
    const { mine } = seed();
    const c = ctx('alice', WRITE);
    expect(api.rename(c, mine.id, { title: 'Renamed' }).title).toBe('Renamed');
    api.remove(c, mine.id);
    expect(code(() => api.getPage(c, mine.id))).toBe('not_found');
    expect(code(() => api.remove(ctx('alice', READ), seed().mine.id))).toBe('forbidden');
  });

  it('takes files as text or base64, not both', () => {
    expect(api.decodeFiles([{ path: 'a.txt', base64: Buffer.from('hi').toString('base64') }])[0].data.toString()).toBe('hi');
    expect(code(() => api.decodeFiles([{ path: 'a.txt', text: 'x', base64: 'eA==' }]))).toBe('invalid');
    expect(code(() => api.decodeFiles([{ path: 'a.txt' }]))).toBe('invalid');
  });

  it('records changes in the audit log, with the key', () => {
    const c = ctx('alice', WRITE);
    api.create(c, { title: 'A', files: text('index.html', 'x') });
    expect(code(() => api.create(c, { title: 'B', files: text('nope.html', 'x') }))).toBe('invalid');
    const rows = env.db.db.prepare('SELECT action, ok, key_id FROM audit_log ORDER BY id').all();
    expect(rows).toEqual([
      { action: 'create_page', ok: 1, key_id: 'k1' },
      { action: 'create_page', ok: 0, key_id: 'k1' },
    ]);
  });

  it('describes what the caller may do', () => {
    expect(api.guideHeader(ctx('alice', READ))).toContain('read-only');
    expect(api.guideHeader(ctx('alice', WRITE))).toContain('cdn.jsdelivr.net');
  });
});
