import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { keyActions, type KeyAction } from '@/lib/agent-auth';
import { createMcpServer } from '@/lib/mcp/server';
import { createPage } from '@/lib/pages';
import { DEFAULT_CDN_HOSTS } from '@/lib/sandbox';
import { file, html, tempEnv, type Env } from './helpers';

let env: Env;
beforeEach(() => {
  env = tempEnv();
});
afterEach(() => env.cleanup());

async function connect(userId: string, actions: KeyAction[]) {
  const server = createMcpServer({
    db: env.db,
    dataDir: env.dir,
    baseURL: 'https://hatcher.example',
    agent: { userId, keyId: 'k1', name: 'Tester', actions },
    cdnHosts: DEFAULT_CDN_HOSTS,
    guide: () => '# Pages',
    version: 'test',
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    const text = res.content[0].text;
    return { error: Boolean(res.isError), body: text.startsWith('{') ? JSON.parse(text) : {}, text };
  };
  return { client, call };
}

const READ: KeyAction[] = ['read'];
const WRITE: KeyAction[] = ['read', 'write'];

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

describe('MCP tools', () => {
  it('lists every tool', async () => {
    const { client } = await connect('alice', READ);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['create_page', 'get_page', 'guide', 'list_pages', 'list_versions', 'read_file', 'restore_version', 'update_page'].sort(),
    );
  });

  it('lists and reads only what the owner may see', async () => {
    const { mine, shared, hidden } = seed();
    const { call } = await connect('alice', READ);
    const list = await call('list_pages');
    expect(list.body.pages.map((p: { title: string; access: string }) => [p.title, p.access])).toEqual(
      expect.arrayContaining([
        ['Mine', 'owner'],
        ['Shared', 'read'],
      ]),
    );
    expect(list.body.pages).toHaveLength(2);
    const got = await call('get_page', { id: shared.id });
    expect(got.body.index_html).toContain('shared');
    expect(got.body.url).toBe(`https://hatcher.example/p/${shared.id}`);
    const denied = await call('get_page', { id: hidden.id });
    expect(denied.error).toBe(true);
    expect(denied.body.code).toBe('not_found');
    expect((await call('read_file', { id: mine.id, path: 'index.html' })).body.text).toContain('mine');
  });

  it('refuses writes with a read-only key', async () => {
    seed();
    const { call } = await connect('alice', READ);
    const r = await call('create_page', { title: 'X', files: [{ path: 'index.html', text: 'x' }] });
    expect(r.error).toBe(true);
    expect(r.body.code).toBe('forbidden');
  });

  it('creates, updates with version checks, and restores', async () => {
    const { call } = await connect('alice', WRITE);
    const created = await call('create_page', {
      title: 'Chart',
      files: [{ path: 'index.html', text: html('<script src="https://cdn.jsdelivr.net/npm/d3@7"></script><script src="https://evil.example/x.js"></script>') }],
    });
    expect(created.error).toBe(false);
    expect(created.body.version).toBe(1);
    expect(created.body.warnings.join(' ')).toContain('https://evil.example/x.js');
    expect(created.body.warnings.join(' ')).not.toContain('jsdelivr');
    const id = created.body.id;

    const v2 = await call('update_page', { id, expected_version: 1, files: [{ path: 'data.json', text: '[1,2]' }], note: 'data' });
    expect(v2.body.version).toBe(2);
    const stale = await call('update_page', { id, expected_version: 1, files: [{ path: 'data.json', text: '[]' }] });
    expect(stale.body.code).toBe('conflict');

    const versions = await call('list_versions', { id });
    expect(versions.body.versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    const restored = await call('restore_version', { id, version: 1, expected_version: 2 });
    expect(restored.body.version).toBe(3);
    expect((await call('get_page', { id })).body.files.map((f: { path: string }) => f.path)).toEqual(['index.html']);
  });

  it('lets editors change content but not the title, and refuses read-only shares', async () => {
    const { shared } = seed();
    const { call } = await connect('alice', WRITE);
    const ro = await call('update_page', { id: shared.id, expected_version: 1, files: [{ path: 'index.html', text: 'x' }] });
    expect(ro.body.code).toBe('forbidden');
    env.db.putShare(shared.id, 'alice', 'write', 'bob');
    expect((await call('update_page', { id: shared.id, expected_version: 1, files: [{ path: 'index.html', text: 'x' }] })).body.version).toBe(2);
    expect((await call('update_page', { id: shared.id, expected_version: 2, title: 'Mine now' })).body.code).toBe('forbidden');
  });

  it('records changes in the audit log', async () => {
    const { call } = await connect('alice', WRITE);
    await call('create_page', { title: 'A', files: [{ path: 'index.html', text: 'x' }] });
    await call('create_page', { title: 'B', files: [{ path: 'nope.html', text: 'x' }] });
    const rows = env.db.db.prepare('SELECT action, ok, key_id FROM audit_log ORDER BY id').all();
    expect(rows).toEqual([
      { action: 'create_page', ok: 1, key_id: 'k1' },
      { action: 'create_page', ok: 0, key_id: 'k1' },
    ]);
  });
});
