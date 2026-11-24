// What a signed-in user or an API key may do with pages, independent of HTTP. The REST routes
// under src/app/api/pages call these and turn PageErrors into status codes (src/lib/api.ts).
// See docs/api.md.
import path from 'node:path';
import type { Db, PageRow } from './db';
import { accessTo, canManage, canRead, canWrite, type PageAccess } from './page-access';
import {
  createPage,
  deletePage,
  LIMITS,
  MAIN_FILE,
  PageError,
  pageFiles,
  readPageFile,
  restoreVersion,
  setDetails,
  updatePage,
  type FileWrite,
} from './pages';
import { blockedResources, TEXT_EXTS } from './sandbox';

export type Action = 'read' | 'write';

/** Who is asking: a signed-in user (both actions) or an API key (its own actions). */
export interface Requester {
  userId: string;
  /** Set when the request came with an API key. */
  keyId?: string;
  actions: Action[];
}

export interface ApiContext {
  db: Db;
  dataDir: string;
  /** Public base URL of the site, for page links. */
  baseURL: string;
  cdnHosts: string[];
  who: Requester;
}

const MB = 1024 * 1024;

export interface PageSummary {
  id: string;
  title: string;
  description: string;
  access: PageAccess;
  version: number;
  updatedAt: string;
  url: string;
}

function summary(ctx: ApiContext, page: PageRow, access: PageAccess): PageSummary {
  return {
    id: page.id,
    title: page.title,
    description: page.description,
    access,
    version: page.version,
    updatedAt: page.updated_at,
    url: `${ctx.baseURL}/p/${page.id}`,
  };
}

function need(ctx: ApiContext, action: Action) {
  if (!ctx.who.actions.includes(action)) {
    throw new PageError('forbidden', action === 'write' ? 'this API key is read-only; create a write key at /account' : 'this API key may not read');
  }
}

/** The page if the requester may read it; the same error whether it is missing or not shared. */
function readable(ctx: ApiContext, id: string): { page: PageRow; access: PageAccess } {
  need(ctx, 'read');
  const page = ctx.db.page(id);
  const access = page ? accessTo(ctx.db, page, ctx.who.userId) : null;
  if (!page || !canRead(access)) throw new PageError('not_found', `no page "${id}" (or it is not shared with you)`);
  return { page, access: access! };
}

function writable(ctx: ApiContext, id: string) {
  need(ctx, 'write');
  const r = readable(ctx, id);
  if (!canWrite(r.access)) throw new PageError('forbidden', 'the page is shared with you read-only');
  return r;
}

function owned(ctx: ApiContext, id: string, what: string) {
  const r = writable(ctx, id);
  if (!canManage(r.access)) throw new PageError('forbidden', `only the owner can ${what}`);
  return r;
}

function checkVersion(page: PageRow, v: number | undefined): number {
  const version = v ?? page.version;
  if (!Number.isInteger(version) || version < 1 || version > page.version) throw new PageError('not_found', `no version ${v}`);
  return version;
}

/** Resources index.html references on hosts pages may not load from. */
function warnings(ctx: ApiContext, id: string, version: number): string[] {
  try {
    const html = readPageFile(ctx.dataDir, id, version, MAIN_FILE).toString('utf8');
    const blocked = blockedResources(html, ctx.cdnHosts);
    return blocked.length ? [`These are on hosts pages may not load from, so they will not load: ${blocked.join(', ')}`] : [];
  } catch {
    return [];
  }
}

function audit(ctx: ApiContext, action: string, target: string, ok = true, detail?: string) {
  ctx.db.audit({ userId: ctx.who.userId, keyId: ctx.who.keyId, action, target, ok, detail });
}

/** Run a change and record it in the audit log, failed or not. */
function audited<T>(ctx: ApiContext, action: string, target: string, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof PageError) audit(ctx, action, target, false, err.message);
    throw err;
  }
}

// ---- Reading ----

export function listPages(ctx: ApiContext, query?: string): PageSummary[] {
  need(ctx, 'read');
  const q = query?.trim().toLowerCase();
  return ctx.db
    .visiblePages(ctx.who.userId)
    .filter((p) => !q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
    .map((p) => summary(ctx, p, p.access));
}

export function getPage(ctx: ApiContext, id: string, version?: number) {
  const { page, access } = readable(ctx, id);
  const v = checkVersion(page, version);
  return { ...summary(ctx, page, access), shownVersion: v, files: pageFiles(ctx.dataDir, id, v), warnings: warnings(ctx, id, v) };
}

/** One file: text as `text`, anything else as `base64`. */
export interface FileContent {
  path: string;
  version: number;
  size: number;
  text?: string;
  base64?: string;
}

export function readFile(ctx: ApiContext, id: string, filePath: string, version?: number): FileContent {
  const { page } = readable(ctx, id);
  const v = checkVersion(page, version);
  const data = readPageFile(ctx.dataDir, id, v, filePath);
  const text = TEXT_EXTS.has(path.extname(filePath).toLowerCase());
  return { path: filePath, version: v, size: data.length, ...(text ? { text: data.toString('utf8') } : { base64: data.toString('base64') }) };
}

export function listVersions(ctx: ApiContext, id: string) {
  readable(ctx, id);
  return ctx.db.versions(id).map((v) => ({ version: v.version, at: v.created_at, note: v.note, files: v.files, bytes: v.bytes }));
}

// ---- Writing ----

export interface FileInput {
  path: string;
  text?: string;
  base64?: string;
}

/** Files from a JSON body: exactly one of `text` (UTF-8) or `base64` each. */
export function decodeFiles(files: FileInput[]): FileWrite[] {
  return files.map((f) => {
    if ((f.text === undefined) === (f.base64 === undefined)) throw new PageError('invalid', `file "${f.path}": give exactly one of text or base64`);
    return { path: f.path, data: f.text !== undefined ? Buffer.from(f.text, 'utf8') : Buffer.from(f.base64!, 'base64') };
  });
}

export function create(ctx: ApiContext, req: { title: string; description?: string; files: FileWrite[]; note?: string }) {
  need(ctx, 'write');
  return audited(ctx, 'create_page', req.title, () => {
    const page = createPage(ctx.db, ctx.dataDir, { userId: ctx.who.userId, keyId: ctx.who.keyId }, req);
    audit(ctx, 'create_page', page.id);
    return { ...summary(ctx, page, 'owner'), warnings: warnings(ctx, page.id, 1) };
  });
}

/** A new version from changed and deleted files, based on `expectedVersion`. */
export function update(ctx: ApiContext, id: string, req: { expectedVersion: number; files?: FileWrite[]; delete?: string[]; note?: string }) {
  return audited(ctx, 'update_page', id, () => {
    writable(ctx, id);
    const version = updatePage(ctx.db, ctx.dataDir, id, { userId: ctx.who.userId, keyId: ctx.who.keyId }, req);
    audit(ctx, 'update_page', `${id}@${version}`);
    const page = ctx.db.page(id)!;
    return { ...summary(ctx, page, accessTo(ctx.db, page, ctx.who.userId)!), warnings: warnings(ctx, id, version) };
  });
}

export function restore(ctx: ApiContext, id: string, version: number, expectedVersion: number) {
  return audited(ctx, 'restore_version', `${id}@${version}`, () => {
    writable(ctx, id);
    const v = restoreVersion(ctx.db, ctx.dataDir, id, { userId: ctx.who.userId, keyId: ctx.who.keyId }, version, expectedVersion);
    audit(ctx, 'restore_version', `${id}@${version}`);
    return { id, version: v, url: `${ctx.baseURL}/p/${id}` };
  });
}

/** Rename or redescribe (owner only; no new version). */
export function rename(ctx: ApiContext, id: string, details: { title?: string; description?: string }) {
  owned(ctx, id, 'rename a page');
  setDetails(ctx.db, id, details);
  const page = ctx.db.page(id)!;
  return summary(ctx, page, 'owner');
}

/** Delete with every version and share (owner only). */
export function remove(ctx: ApiContext, id: string) {
  owned(ctx, id, 'delete a page');
  deletePage(ctx.db, ctx.dataDir, id);
  audit(ctx, 'delete_page', id);
}

/** What the requester may do, the limits, and the hosts pages may load from: for agents, before writing. */
export function guideHeader(ctx: ApiContext): string {
  const write = ctx.who.actions.includes('write');
  return [
    write
      ? 'You may read and write: create pages, and change pages you own or that are shared with you for editing.'
      : 'You may read pages you own or that are shared with you (read-only key).',
    'Sharing is done by the page owner in the web UI.',
    '',
    `Pages may load scripts, styles, fonts and data from this server and these hosts only: ${ctx.cdnHosts.join(', ') || '(none)'}.`,
    `Limits: ${LIMITS.files} files and ${LIMITS.pageBytes / MB} MB per page, ${LIMITS.fileBytes / MB} MB per file.`,
  ].join('\n');
}
