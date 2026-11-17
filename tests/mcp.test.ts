import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMcpServer } from '@/lib/mcp/server';
import type { PageAction } from '@/lib/roles';
import { effectiveActions } from '@/lib/roles';
import { page } from './helpers';

let dir: string;
let audit: { action: string; ok: boolean; target?: string }[];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hatcher-mcp-'));
  fs.mkdirSync(path.join(dir, 'concepts'));
  fs.writeFileSync(path.join(dir, 'concepts/live.mdx'), page('Live', 'ready'));
  fs.writeFileSync(path.join(dir, 'concepts/wip.mdx'), page('Work in progress', 'draft'));
  audit = [];
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

async function connect(actions: PageAction[]) {
  const server = createMcpServer({
    dir,
    baseURL: 'https://studio.example',
    agent: { userId: 'u1', keyId: 'k1', name: 'Tester', actions },
    audit: (r) => audit.push(r),
    guide: () => '# Content format',
    version: 'test',
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    return { error: Boolean(res.isError), body: JSON.parse(res.content[0].text.startsWith('{') ? res.content[0].text : '{}'), text: res.content[0].text };
  };
  return { client, call };
}

const READ: PageAction[] = ['read'];
const WRITE: PageAction[] = ['read', 'write'];
const PUBLISH: PageAction[] = ['read', 'write', 'publish'];

describe('key access', () => {
  it('is the key access limited by the current role', () => {
    expect(effectiveActions({ pages: ['read', 'write', 'publish'] }, 'editor')).toEqual(['read', 'write']);
    expect(effectiveActions('{"pages":["read","write"]}', 'user')).toEqual(['read']);
    expect(effectiveActions({ pages: ['read', 'delete-everything'] }, 'admin')).toEqual(['read']);
    expect(effectiveActions(null, 'admin')).toEqual([]);
  });
});

describe('MCP tools', () => {
  it('lists every tool', async () => {
    const { client } = await connect(READ);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['delete_page', 'get_page', 'guide', 'list_pages', 'read_file', 'set_status', 'validate_page', 'write_page'].sort(),
    );
  });

  it('shows readers published pages only', async () => {
    const { call } = await connect(READ);
    expect((await call('list_pages')).body.pages.map((p: { slug: string }) => p.slug)).toEqual(['live']);
    expect((await call('get_page', { kind: 'concept', slug: 'wip' })).error).toBe(true);
    expect((await call('get_page', { kind: 'concept', slug: 'live' })).body.title).toBe('Live');
    const denied = await call('write_page', { kind: 'concept', slug: 'x', files: [{ path: 'index.mdx', text: page('X') }] });
    expect(denied.error).toBe(true);
    expect(denied.text).toMatch(/cannot write/);
    expect(audit).toEqual([{ userId: 'u1', keyId: 'k1', action: 'write_page', target: 'concepts/x', ok: false, detail: expect.any(String) }]);
  });

  it('lets editors write drafts but not publish or touch published pages', async () => {
    const { call } = await connect(WRITE);
    expect((await call('list_pages')).body.count).toBe(2);

    const created = await call('write_page', { kind: 'concept', slug: 'new', files: [{ path: 'index.mdx', text: page('New') }] });
    expect(created.error).toBe(false);
    expect(created.body).toMatchObject({ saved: true, created: true, status: 'draft', url: 'https://studio.example/concepts/new' });

    const asReady = await call('write_page', { kind: 'concept', slug: 'new2', files: [{ path: 'index.mdx', text: page('New', 'ready') }] });
    expect(asReady.text).toMatch(/status: draft/);

    const live = await call('get_page', { kind: 'concept', slug: 'live' });
    const edit = await call('write_page', { kind: 'concept', slug: 'live', expected_version: live.body.version, files: [{ path: 'index.mdx', text: page('Live!', 'draft') }] });
    expect(edit.text).toMatch(/is published/);
    expect((await call('set_status', { kind: 'concept', slug: 'new', status: 'ready', expected_version: created.body.version })).text).toMatch(/cannot publish/);
    expect((await call('delete_page', { kind: 'concept', slug: 'live', expected_version: live.body.version })).text).toMatch(/is published/);
    expect(fs.readFileSync(path.join(dir, 'concepts/live.mdx'), 'utf8')).toBe(page('Live', 'ready'));
  });

  it('returns validation problems and saves nothing for invalid pages', async () => {
    const { call } = await connect(WRITE);
    const files = [{ path: 'index.mdx', text: page('Bad', 'draft', 'import x from "y"\n\n<Nope />') }];
    const check = await call('validate_page', { kind: 'concept', slug: 'bad', files });
    expect(check.body.valid).toBe(false);
    const res = await call('write_page', { kind: 'concept', slug: 'bad', files });
    expect(res.error).toBe(true);
    expect(res.body.code).toBe('invalid');
    expect(fs.existsSync(path.join(dir, 'concepts/bad'))).toBe(false);
  });

  it('lets publish keys publish valid pages', async () => {
    const { call } = await connect(PUBLISH);
    const wip = await call('get_page', { kind: 'concept', slug: 'wip' });
    const res = await call('set_status', { kind: 'concept', slug: 'wip', status: 'ready', expected_version: wip.body.version });
    expect(res.body.status).toBe('ready');
    expect(fs.readFileSync(path.join(dir, 'concepts/wip.mdx'), 'utf8')).toMatch(/^status: ready$/m);
    expect(audit.at(-1)).toMatchObject({ action: 'set_status', ok: true, target: 'concepts/wip -> ready' });
  });

  it('reads figure files as text and binary files as base64', async () => {
    const { call } = await connect(WRITE);
    const res = await call('write_page', {
      kind: 'concept',
      slug: 'fig',
      files: [
        { path: 'index.mdx', text: page('Fig', 'draft', '<Figure src="f.html" />') },
        { path: 'f.html', text: '<p>hi</p>' },
        { path: 'a.png', base64: 'iVBORw==' },
      ],
    });
    expect(res.error).toBe(false);
    expect((await call('read_file', { kind: 'concept', slug: 'fig', path: 'f.html' })).body.text).toBe('<p>hi</p>');
    expect((await call('read_file', { kind: 'concept', slug: 'fig', path: 'a.png' })).body.base64).toBe('iVBORw==');
    expect((await call('read_file', { kind: 'concept', slug: 'fig', path: '../live.mdx' })).error).toBe(true);
  });

  it('includes permissions in the guide', async () => {
    const { call } = await connect(WRITE);
    expect((await call('guide')).text).toMatch(/This key may: read, write\.[\s\S]*# Content format/);
  });
});
