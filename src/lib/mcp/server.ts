// The Hatcher MCP server: tools for agents to read and write the pages their key's owner can reach.
// One server is built per request for the authenticated agent (src/app/api/mcp/route.ts).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import path from 'node:path';
import { z } from 'zod';
import type { KeyAction } from '../agent-auth';
import type { Db, PageRow } from '../db';
import { accessTo, canManage, canRead, canWrite, type PageAccess } from '../page-access';
import {
  LIMITS,
  MAIN_FILE,
  PageError,
  createPage,
  pageFiles,
  readPageFile,
  restoreVersion,
  setDetails,
  updatePage,
  type FileWrite,
} from '../pages';
import { blockedResources, TEXT_EXTS } from '../sandbox';

export interface McpContext {
  db: Db;
  dataDir: string;
  /** Public base URL of the site, for page links. */
  baseURL: string;
  agent: { userId: string; keyId?: string; name: string; actions: KeyAction[] };
  cdnHosts: string[];
  /** The page-writing guide (docs/pages.md). */
  guide: () => string;
  version: string;
}

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

const json = (value: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const failure = (message: string, extra?: object): ToolResult => ({
  isError: true,
  content: [{ type: 'text', text: JSON.stringify({ error: message, ...extra }, null, 2) }],
});

const MB = 1024 * 1024;
const MAX_TEXT = 8 * MB;

const pageId = z.string().max(40).describe('Page id, from list_pages or a page URL (/p/<id>)');
const fileWrite = z.object({
  path: z.string().max(400).describe('Path inside the page, e.g. index.html or js/app.js'),
  text: z.string().max(MAX_TEXT).optional().describe('UTF-8 content'),
  base64: z.string().max(MAX_TEXT).optional().describe('Binary content, base64'),
});

function decode(files: z.infer<typeof fileWrite>[]): FileWrite[] {
  return files.map((f) => {
    if ((f.text === undefined) === (f.base64 === undefined)) throw new PageError('invalid', `file "${f.path}": give exactly one of text or base64`);
    return { path: f.path, data: f.text !== undefined ? Buffer.from(f.text, 'utf8') : Buffer.from(f.base64!, 'base64') };
  });
}

export function createMcpServer(ctx: McpContext): McpServer {
  const { db } = ctx;
  const can = (a: KeyAction) => ctx.agent.actions.includes(a);
  const url = (id: string) => `${ctx.baseURL}/p/${id}`;
  const author = { userId: ctx.agent.userId, keyId: ctx.agent.keyId };

  /** Run a tool body, turning PageErrors into tool errors and recording changes in the audit log. */
  async function run(action: string | null, target: string | undefined, fn: () => Promise<ToolResult> | ToolResult): Promise<ToolResult> {
    let result: ToolResult;
    try {
      result = await fn();
    } catch (err) {
      if (!(err instanceof PageError)) throw err;
      result = failure(err.message, { code: err.code });
    }
    if (action) {
      const detail = result.isError ? result.content[0].text : undefined;
      db.audit({ userId: ctx.agent.userId, keyId: ctx.agent.keyId, action, target, ok: !result.isError, detail });
    }
    return result;
  }

  function requireWriteKey() {
    if (!can('write')) throw new PageError('forbidden', 'this API key is read-only; create a write key at /account');
  }

  /** The page if this agent's owner may read it; the same error whether it is missing or not shared. */
  function readable(id: string): { page: PageRow; access: PageAccess } {
    const page = db.page(id);
    const access = page ? accessTo(db, page, ctx.agent.userId) : null;
    if (!page || !canRead(access)) throw new PageError('not_found', `no page "${id}" (or it is not shared with you)`);
    return { page, access: access! };
  }

  function writable(id: string) {
    requireWriteKey();
    const r = readable(id);
    if (!canWrite(r.access)) throw new PageError('forbidden', 'the page is shared with you read-only');
    return r;
  }

  function summary(page: PageRow, access: PageAccess) {
    return { id: page.id, title: page.title, description: page.description, access, version: page.version, updated_at: page.updated_at, url: url(page.id) };
  }

  function warnings(id: string, version: number): string[] {
    try {
      const html = readPageFile(ctx.dataDir, id, version, MAIN_FILE).toString('utf8');
      const blocked = blockedResources(html, ctx.cdnHosts);
      return blocked.length ? [`These are on hosts pages may not load from, so they will not load: ${blocked.join(', ')}`] : [];
    } catch {
      return [];
    }
  }

  function checkVersion(page: PageRow, v: number | undefined): number {
    const version = v ?? page.version;
    if (version > page.version) throw new PageError('not_found', `no version ${version}`);
    return version;
  }

  const server = new McpServer(
    { name: 'hatcher', version: ctx.version },
    {
      instructions:
        'Hatcher hosts private, shareable HTML pages, like artifacts. Call guide first for the page format and what pages may load. ' +
        'Read a page with get_page before changing it and pass its version as expected_version.',
    },
  );

  server.registerTool(
    'guide',
    {
      title: 'Hatcher guide',
      description: 'How pages work, what they may load, limits, and what this API key may do. Read it before writing.',
      annotations: { readOnlyHint: true },
    },
    () =>
      run(null, undefined, () => ({
        content: [
          {
            type: 'text',
            text: [
              `# Using Hatcher as ${ctx.agent.name}`,
              '',
              can('write')
                ? 'This key may read and write: create pages, and change pages you own or that are shared with you for editing.'
                : 'This key is read-only: it may read pages you own or that are shared with you.',
              'Sharing, renaming and deleting are done by the page owner in the web UI.',
              '',
              `Pages may load scripts, styles, fonts and data from this server and these hosts only: ${ctx.cdnHosts.join(', ') || '(none)'}.`,
              `Limits: ${LIMITS.files} files and ${LIMITS.pageBytes / MB} MB per page, ${LIMITS.fileBytes / MB} MB per file.`,
              '',
              '---',
              '',
              ctx.guide(),
            ].join('\n'),
          },
        ],
      })),
  );

  server.registerTool(
    'list_pages',
    {
      title: 'List pages',
      description: 'Pages you own or that are shared with you, most recently changed first.',
      inputSchema: { query: z.string().max(200).optional().describe('Only pages whose title or description contains this text') },
      annotations: { readOnlyHint: true },
    },
    ({ query }) =>
      run(null, undefined, () => {
        const q = query?.toLowerCase();
        const pages = db
          .visiblePages(ctx.agent.userId)
          .filter((p) => !q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
          .map((p) => summary(p, p.access));
        return json({ pages });
      }),
  );

  server.registerTool(
    'get_page',
    {
      title: 'Read a page',
      description: 'A page’s details, its files, and the text of index.html. Pass its version as expected_version when you change it.',
      inputSchema: { id: pageId, version: z.number().int().min(1).optional().describe('An earlier version; default the current one') },
      annotations: { readOnlyHint: true },
    },
    ({ id, version }) =>
      run(null, undefined, () => {
        const { page, access } = readable(id);
        const v = checkVersion(page, version);
        return json({
          ...summary(page, access),
          shown_version: v,
          files: pageFiles(ctx.dataDir, id, v),
          index_html: readPageFile(ctx.dataDir, id, v, MAIN_FILE).toString('utf8'),
          warnings: warnings(id, v),
        });
      }),
  );

  server.registerTool(
    'read_file',
    {
      title: 'Read a file',
      description: 'One file of a page: text as text, anything else as base64.',
      inputSchema: { id: pageId, path: z.string().max(400), version: z.number().int().min(1).optional() },
      annotations: { readOnlyHint: true },
    },
    ({ id, path: p, version }) =>
      run(null, undefined, () => {
        const { page } = readable(id);
        const v = checkVersion(page, version);
        const data = readPageFile(ctx.dataDir, id, v, p);
        const text = TEXT_EXTS.has(path.extname(p).toLowerCase());
        return json({ path: p, version: v, size: data.length, ...(text ? { text: data.toString('utf8') } : { base64: data.toString('base64') }) });
      }),
  );

  server.registerTool(
    'list_versions',
    {
      title: 'Version history',
      description: 'Every saved version of a page, newest first.',
      inputSchema: { id: pageId },
      annotations: { readOnlyHint: true },
    },
    ({ id }) =>
      run(null, undefined, () => {
        readable(id);
        return json({ versions: db.versions(id).map((v) => ({ version: v.version, at: v.created_at, note: v.note, files: v.files, bytes: v.bytes })) });
      }),
  );

  server.registerTool(
    'create_page',
    {
      title: 'Create a page',
      description:
        'Create a new private page from index.html and any files beside it. Returns its id, version and URL. ' +
        'Only you can see it until you share it in the web UI.',
      inputSchema: {
        title: z.string().max(LIMITS.title),
        description: z.string().max(LIMITS.description).optional().describe('One or two sentences shown in page lists'),
        files: z.array(fileWrite).min(1).max(LIMITS.files).describe('index.html is required'),
        note: z.string().max(500).optional().describe('What this version is, shown in the history'),
      },
    },
    ({ title, description, files, note }) =>
      run('create_page', title, () => {
        requireWriteKey();
        const page = createPage(db, ctx.dataDir, author, { title, description, files: decode(files), note });
        return json({ ...summary(page, 'owner'), warnings: warnings(page.id, 1) });
      }),
  );

  server.registerTool(
    'update_page',
    {
      title: 'Change a page',
      description:
        'Save a new version: files to add or replace and paths to delete, based on expected_version from get_page. ' +
        'Only the owner may change the title or description.',
      inputSchema: {
        id: pageId,
        expected_version: z.number().int().min(1),
        files: z.array(fileWrite).max(LIMITS.files).optional(),
        delete: z.array(z.string().max(400)).max(LIMITS.files).optional(),
        title: z.string().max(LIMITS.title).optional(),
        description: z.string().max(LIMITS.description).optional(),
        note: z.string().max(500).optional(),
      },
    },
    ({ id, expected_version, files, delete: remove, title, description, note }) =>
      run('update_page', id, () => {
        const { page, access } = writable(id);
        const details = title !== undefined || description !== undefined;
        if (details && !canManage(access)) throw new PageError('forbidden', 'only the owner can change the title or description');
        if (!files?.length && !remove?.length && !details) throw new PageError('invalid', 'nothing to change');
        if (page.version !== expected_version) {
          throw new PageError('conflict', `the page changed since version ${expected_version} (now ${page.version}); read it again`);
        }
        let version = page.version;
        if (files?.length || remove?.length) {
          version = updatePage(db, ctx.dataDir, id, author, { expectedVersion: expected_version, files: decode(files ?? []), delete: remove, note });
        }
        if (details) setDetails(db, id, { title, description });
        return json({ ...summary(db.page(id)!, access), warnings: warnings(id, version) });
      }),
  );

  server.registerTool(
    'restore_version',
    {
      title: 'Restore a version',
      description: 'Save a new version that is a copy of an earlier one. Nothing is lost: the history keeps every version.',
      inputSchema: { id: pageId, version: z.number().int().min(1), expected_version: z.number().int().min(1) },
    },
    ({ id, version, expected_version }) =>
      run('restore_version', `${id}@${version}`, () => {
        writable(id);
        const v = restoreVersion(db, ctx.dataDir, id, author, version, expected_version);
        return json({ id, version: v, url: url(id) });
      }),
  );

  return server;
}
