// The Hatcher MCP server: tools for agents to read and write pages in CONTENT_DIR.
// One server is built per request for the authenticated agent (src/app/api/mcp/route.ts).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import path from 'node:path';
import { z } from 'zod';
import { loadEntries, type Entry } from '../content';
import {
  LIMITS,
  PageError,
  commitStaged,
  deletePage,
  discardStaged,
  readPage,
  readPageFile,
  setStatus,
  stagePage,
  withPageLock,
  type WriteRequest,
} from '../page-store';
import type { PageAction } from '../roles';
import { KIND_DIRS, KINDS, type Kind } from '../kinds';
import { validateEntry } from '../validate';

export interface McpContext {
  dir: string;
  /** Public base URL of the studio, for page links. */
  baseURL: string;
  agent: { userId: string; keyId?: string; name: string; actions: PageAction[] };
  audit: (r: { userId: string; keyId?: string; action: string; target?: string; ok: boolean; detail?: string }) => void;
  /** The content format reference (docs/content-format.md). */
  guide: () => string;
  version: string;
}

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

const json = (value: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const failure = (message: string, extra?: object): ToolResult => ({
  isError: true,
  content: [{ type: 'text', text: JSON.stringify({ error: message, ...extra }, null, 2) }],
});

const TEXT_EXTS = new Set(['.mdx', '.html', '.js', '.mjs', '.css', '.json', '.csv', '.txt', '.svg', '.gltf']);
const MAX_TEXT = 3 * 1024 * 1024;

const kind = z.enum(KINDS).describe('Page kind: concept, paper or roadmap');
const slug = z.string().max(80).describe('Page slug: lowercase letters, digits and hyphens');
const version = z.string().max(64).describe('The page version from get_page');
const fileWrite = z.object({
  path: z.string().max(200).describe('Path inside the page folder, e.g. index.mdx or figures/flow.html'),
  text: z.string().max(MAX_TEXT).optional().describe('UTF-8 content'),
  base64: z.string().max(MAX_TEXT).optional().describe('Binary content, base64'),
});
const writeShape = {
  kind,
  slug,
  files: z.array(fileWrite).max(LIMITS.files).describe('Files to create or replace. The page itself is index.mdx or index.html.'),
  delete: z.array(z.string().max(200)).max(LIMITS.files).optional().describe('Paths to remove from the page folder'),
  expected_version: version.optional().describe('Required when the page exists (from get_page); omit to create a page'),
};

export function createMcpServer(ctx: McpContext): McpServer {
  const can = (a: PageAction) => ctx.agent.actions.includes(a);
  const visible = (e: Pick<Entry, 'status' | 'error'>) => can('write') || (!e.error && e.status === 'ready');
  const url = (k: Kind, s: string) => `${ctx.baseURL}/${KIND_DIRS[k]}/${s}`;
  const target = (k: Kind, s: string) => `${KIND_DIRS[k]}/${s}`;

  /** Run a tool body, turning PageErrors into tool errors and recording changes in the audit log. */
  async function run(action: string | null, where: string | undefined, fn: () => Promise<ToolResult> | ToolResult): Promise<ToolResult> {
    let result: ToolResult;
    try {
      result = await fn();
    } catch (err) {
      if (!(err instanceof PageError)) throw err;
      result = failure(err.message, { code: err.code });
    }
    if (action) {
      const detail = result.isError ? result.content[0].text : undefined;
      ctx.audit({ userId: ctx.agent.userId, keyId: ctx.agent.keyId, action, target: where, ok: !result.isError, detail });
    }
    return result;
  }

  function requireAction(a: PageAction): ToolResult | null {
    if (can(a)) return null;
    return failure(`this key cannot ${a} pages (key access: ${ctx.agent.actions.join(', ') || 'none'})`, { code: 'forbidden' });
  }

  function readable(k: Kind, s: string) {
    const page = readPage(ctx.dir, k, s);
    if (!visible(page.entry)) throw new PageError('not_found', `no ${k} "${s}"`);
    return page;
  }

  const server = new McpServer(
    { name: 'hatcher', version: ctx.version },
    {
      instructions:
        'Hatcher is a reading site of concept, paper and roadmap pages. Call guide first: it gives the page format, the rules ' +
        'pages must follow, and what this key may do. Read a page with get_page before changing it and pass its version.',
    },
  );

  server.registerTool(
    'guide',
    {
      title: 'Hatcher guide',
      description: 'The page format, writing rules, limits, and what this API key may do. Read it before writing.',
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
              `This key may: ${ctx.agent.actions.join(', ') || 'nothing'}.`,
              can('write')
                ? can('publish')
                  ? 'You may create, edit and delete any page and publish with set_status.'
                  : 'You may create and edit draft pages (status: draft). Published pages, and publishing, need an admin key.'
                : 'You may read published pages only.',
              '',
              '## Workflow',
              '1. list_pages to see what exists; get_page for a page and its version.',
              '2. validate_page to check a change without saving it.',
              '3. write_page with the files to create or replace (and paths to delete). Every write is validated; an invalid page is not saved.',
              '   Pass expected_version from get_page when the page exists. A page is a folder: index.mdx or index.html plus any figures and assets.',
              '',
              `Limits: ${LIMITS.files} files and ${LIMITS.pageBytes / 1048576} MB per page, ${LIMITS.fileBytes / 1048576} MB per file, ` +
                'folder depth 4, file names of letters, digits, ".", "_" and "-".',
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
      description: 'Pages with their title, status and summary. Drafts and invalid pages are listed only for keys that may write.',
      inputSchema: {
        kind: kind.optional(),
        status: z.enum(['draft', 'ready']).optional(),
        query: z.string().max(200).optional().describe('Case-insensitive match on slug, title, summary or tags'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ kind: k, status, query }) =>
      run(null, undefined, () => {
        const q = query?.toLowerCase();
        const pages = loadEntries(ctx.dir)
          .filter(visible)
          .filter((e) => (!k || e.kind === k) && (!status || e.status === status))
          .filter((e) => !q || [e.slug, e.title, e.summary, ...e.tags].some((t) => t.toLowerCase().includes(q)))
          .slice(0, 1000)
          .map((e) => ({
            kind: e.kind,
            slug: e.slug,
            title: e.title,
            status: e.status,
            format: e.format,
            level: e.level,
            summary: e.summary,
            ...(e.error ? { error: e.error } : {}),
          }));
        return json({ count: pages.length, pages });
      }),
  );

  server.registerTool(
    'get_page',
    {
      title: 'Get page',
      description: 'A page’s main file source, its files, and its version (needed to change it).',
      inputSchema: { kind, slug },
      annotations: { readOnlyHint: true },
    },
    ({ kind: k, slug: s }) =>
      run(null, undefined, () => {
        const page = readable(k, s);
        return json({
          kind: k,
          slug: s,
          format: page.entry.format,
          status: page.entry.status,
          title: page.entry.title,
          version: page.version,
          url: url(k, s),
          main: `index${path.extname(page.loc.main!)}`,
          files: page.files,
          ...(page.entry.error ? { error: page.entry.error } : {}),
          source: page.source,
        });
      }),
  );

  server.registerTool(
    'read_file',
    {
      title: 'Read page file',
      description: 'One file from a page folder: text for text formats, base64 otherwise.',
      inputSchema: { kind, slug, path: z.string().max(200) },
      annotations: { readOnlyHint: true },
    },
    ({ kind: k, slug: s, path: p }) =>
      run(null, undefined, () => {
        readable(k, s);
        const data = readPageFile(ctx.dir, k, s, p);
        const text = TEXT_EXTS.has(path.extname(p).toLowerCase());
        return json(text ? { path: p, text: data.toString('utf8') } : { path: p, base64: data.toString('base64') });
      }),
  );

  async function stageChecked(args: z.infer<z.ZodObject<typeof writeShape>>) {
    const req: WriteRequest = { kind: args.kind, slug: args.slug, files: args.files, delete: args.delete, expectedVersion: args.expected_version };
    const staged = await stagePage(ctx.dir, req);
    if (!can('publish')) {
      if (staged.previousStatus === 'ready') {
        discardStaged(staged);
        throw new PageError('forbidden', `${args.kind} "${args.slug}" is published; changing it needs a key with publish access`);
      }
      if (staged.entry.status === 'ready' && !staged.entry.error) {
        discardStaged(staged);
        throw new PageError('forbidden', 'set status: draft in the frontmatter; publishing needs a key with publish access');
      }
    }
    return staged;
  }

  server.registerTool(
    'validate_page',
    {
      title: 'Validate page',
      description: 'Check a write_page change without saving it. Returns the errors and warnings the write would produce.',
      inputSchema: writeShape,
      annotations: { readOnlyHint: true },
    },
    (args) =>
      run(null, undefined, async () => {
        const denied = requireAction('write');
        if (denied) return denied;
        const staged = await stageChecked(args);
        discardStaged(staged);
        const { errors, warnings } = staged.problems;
        return json({ valid: errors.length === 0, errors, warnings });
      }),
  );

  server.registerTool(
    'write_page',
    {
      title: 'Write page',
      description:
        'Create or change a page: the given files are written into its folder and the listed paths removed, then the whole page is ' +
        'validated. Nothing is saved unless it is valid. Returns the new version.',
      inputSchema: writeShape,
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    (args) =>
      run('write_page', target(args.kind, args.slug), () => {
        const denied = requireAction('write');
        if (denied) return denied;
        return withPageLock(args.kind, args.slug, async () => {
          const staged = await stageChecked(args);
          if (staged.problems.errors.length) {
            discardStaged(staged);
            return failure('the page is not valid; nothing was saved', { code: 'invalid', ...staged.problems });
          }
          commitStaged(staged);
          return json({
            saved: true,
            created: staged.previousStatus === null,
            version: staged.version,
            status: staged.entry.status,
            url: url(args.kind, args.slug),
            warnings: staged.problems.warnings,
          });
        });
      }),
  );

  server.registerTool(
    'delete_page',
    {
      title: 'Delete page',
      description: 'Delete a page and its folder. Published pages need publish access.',
      inputSchema: { kind, slug, expected_version: version },
      annotations: { destructiveHint: true },
    },
    ({ kind: k, slug: s, expected_version }) =>
      run('delete_page', target(k, s), () => {
        const denied = requireAction('write');
        if (denied) return denied;
        return withPageLock(k, s, () => {
          const page = readPage(ctx.dir, k, s);
          if (page.entry.status === 'ready' && !page.entry.error && !can('publish')) {
            throw new PageError('forbidden', `${k} "${s}" is published; deleting it needs a key with publish access`);
          }
          deletePage(ctx.dir, k, s, expected_version);
          return json({ deleted: true });
        });
      }),
  );

  server.registerTool(
    'set_status',
    {
      title: 'Publish or unpublish',
      description: 'Set a page’s status: ready (published) or draft. Needs publish access. The page must be valid.',
      inputSchema: { kind, slug, status: z.enum(['draft', 'ready']), expected_version: version },
      annotations: { idempotentHint: true },
    },
    ({ kind: k, slug: s, status, expected_version }) =>
      run('set_status', `${target(k, s)} -> ${status}`, () => {
        const denied = requireAction('publish');
        if (denied) return denied;
        return withPageLock(k, s, async () => {
          if (status === 'ready') {
            const page = readPage(ctx.dir, k, s);
            const { errors } = await validateEntry(page.entry);
            if (errors.length) return failure('the page is not valid; fix it before publishing', { code: 'invalid', errors });
          }
          const v = setStatus(ctx.dir, k, s, status, expected_version);
          return json({ status, version: v, url: url(k, s) });
        });
      }),
  );

  return server;
}
