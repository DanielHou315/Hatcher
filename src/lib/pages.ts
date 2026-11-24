// Pages and their files. A page is an HTML document (index.html) plus optional files beside it
// (scripts, styles, images, data). Every change makes a new, immutable version:
//
//   DATA_DIR/pages/<page id>/<version>/index.html, ...
//
// A new version is built in DATA_DIR/pages/.staging, checked, and renamed into place, then the page
// row moves to it in one transaction that also checks nobody else moved it first. Writers must name
// the version they started from, so nobody overwrites changes they have not seen.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Db, PageRow, VersionRow } from './db';
import { CONTENT_TYPES } from './sandbox';

const MB = 1024 * 1024;
export const LIMITS = { files: 300, fileBytes: 10 * MB, pageBytes: 50 * MB, depth: 6, title: 200, description: 2000 } as const;
export const MAIN_FILE = 'index.html';

const ID_RE = /^[A-Za-z0-9]{12}$/;
const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,119}$/;
const STAGING = '.staging';

export type PageErrorCode = 'not_found' | 'invalid' | 'conflict' | 'forbidden' | 'too_large';

export class PageError extends Error {
  constructor(
    readonly code: PageErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** 12 random base-62 characters (71 bits). Page URLs are unguessable, though access is always checked too. */
export function newPageId(): string {
  const bytes = crypto.randomBytes(24);
  let id = '';
  for (const b of bytes) {
    if (b >= 248) continue; // 248 = 4 * 62: keep the distribution uniform
    id += ALPHABET[b % 62];
    if (id.length === 12) return id;
  }
  return newPageId();
}

export const isPageId = (id: string) => ID_RE.test(id);

/** A file path inside a page: relative, forward slashes, no dot segments, a served file type. */
export function checkFilePath(p: string): string {
  const segments = p.replace(/^\.\//, '').split('/');
  if (segments.length > LIMITS.depth || segments.some((s) => !SEGMENT_RE.test(s) || s.endsWith(' '))) {
    throw new PageError(
      'invalid',
      `path "${p}" must be relative, at most ${LIMITS.depth} levels, and use letters, digits, spaces, ".", "_" and "-" (no leading dots)`,
    );
  }
  const ext = path.extname(p).toLowerCase();
  if (!CONTENT_TYPES[ext]) throw new PageError('invalid', `path "${p}": file type ${ext || '(none)'} is not allowed`);
  return segments.join('/');
}

export function pagesRoot(dataDir: string): string {
  return path.join(dataDir, 'pages');
}

export function versionDir(dataDir: string, id: string, version: number): string {
  if (!isPageId(id) || !Number.isInteger(version) || version < 1) throw new PageError('not_found', 'no such page version');
  return path.join(pagesRoot(dataDir), id, String(version));
}

export interface PageFile {
  path: string;
  size: number;
}

function listFiles(root: string): PageFile[] {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => {
      const abs = path.join(d.parentPath, d.name);
      return { path: path.relative(root, abs).split(path.sep).join('/'), size: fs.statSync(abs).size };
    })
    .sort((a, b) => (a.path === MAIN_FILE ? -1 : b.path === MAIN_FILE ? 1 : a.path.localeCompare(b.path)));
}

export function pageFiles(dataDir: string, id: string, version: number): PageFile[] {
  return listFiles(versionDir(dataDir, id, version));
}

/** Absolute path of a file in a page version, or null if it is not there. Never leaves the version folder. */
export function resolvePageFile(dataDir: string, id: string, version: number, filePath: string): string | null {
  let rel: string;
  let root: string;
  try {
    rel = checkFilePath(filePath);
    root = versionDir(dataDir, id, version);
  } catch {
    return null;
  }
  const abs = path.join(root, rel);
  try {
    const real = fs.realpathSync(abs);
    return real.startsWith(fs.realpathSync(root) + path.sep) && fs.statSync(real).isFile() ? real : null;
  } catch {
    return null;
  }
}

export function readPageFile(dataDir: string, id: string, version: number, filePath: string): Buffer {
  const abs = resolvePageFile(dataDir, id, version, filePath);
  if (!abs) throw new PageError('not_found', `no file "${filePath}" in version ${version}`);
  return fs.readFileSync(abs);
}

export interface FileWrite {
  path: string;
  data: Buffer;
}

export interface Author {
  userId: string;
  keyId?: string | null;
}

function cleanTitle(title: string): string {
  const t = title.replace(/\s+/g, ' ').trim();
  if (!t) throw new PageError('invalid', 'a page needs a title');
  if (t.length > LIMITS.title) throw new PageError('invalid', `title is over ${LIMITS.title} characters`);
  return t;
}

function cleanDescription(description: string | undefined): string {
  const d = (description ?? '').trim();
  if (d.length > LIMITS.description) throw new PageError('invalid', `description is over ${LIMITS.description} characters`);
  return d;
}

/** Build a version folder in staging from `base` (or nothing), apply the changes, and check limits. */
function stage(dataDir: string, id: string, base: string | null, files: FileWrite[], remove: string[]) {
  const root = path.join(pagesRoot(dataDir), STAGING);
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, `${id}-`));
  try {
    if (base) fs.cpSync(base, dir, { recursive: true });
    for (const p of remove) {
      const abs = path.join(dir, checkFilePath(p));
      if (!fs.existsSync(abs)) throw new PageError('not_found', `cannot delete "${p}": not in the page`);
      fs.rmSync(abs);
    }
    for (const f of files) {
      const rel = checkFilePath(f.path);
      if (f.data.length > LIMITS.fileBytes) throw new PageError('too_large', `file "${f.path}" is over ${LIMITS.fileBytes / MB} MB`);
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), f.data);
    }
    const listed = listFiles(dir);
    const bytes = listed.reduce((n, f) => n + f.size, 0);
    if (listed.length > LIMITS.files) throw new PageError('too_large', `a page may hold at most ${LIMITS.files} files`);
    if (bytes > LIMITS.pageBytes) throw new PageError('too_large', `a page may hold at most ${LIMITS.pageBytes / MB} MB`);
    if (!listed.some((f) => f.path === MAIN_FILE)) throw new PageError('invalid', `a page needs ${MAIN_FILE}`);
    return { dir, files: listed.length, bytes };
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

export interface CreatePage {
  title: string;
  description?: string;
  files: FileWrite[];
  note?: string;
}

export function createPage(db: Db, dataDir: string, author: Author, req: CreatePage): PageRow {
  const title = cleanTitle(req.title);
  const description = cleanDescription(req.description);
  const id = newPageId();
  const staged = stage(dataDir, id, null, req.files, []);
  const target = versionDir(dataDir, id, 1);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(staged.dir, target);
  const at = new Date().toISOString();
  const row: PageRow = { id, owner_id: author.userId, title, description, version: 1, created_at: at, updated_at: at };
  try {
    db.tx(() => {
      db.insertPage(row);
      db.insertVersion(versionRow(id, 1, author, req.note, staged, at));
    });
  } catch (err) {
    fs.rmSync(path.dirname(target), { recursive: true, force: true });
    throw err;
  }
  return row;
}

function versionRow(id: string, version: number, author: Author, note: string | undefined, s: { files: number; bytes: number }, at: string): VersionRow {
  return {
    page_id: id,
    version,
    author_id: author.userId,
    key_id: author.keyId ?? null,
    note: note?.slice(0, 500) || null,
    files: s.files,
    bytes: s.bytes,
    created_at: at,
  };
}

export interface UpdatePage {
  /** The version the change was based on. */
  expectedVersion: number;
  files?: FileWrite[];
  delete?: string[];
  note?: string;
}

/** Make a new version from the current one plus changes. Returns the new version number. */
export function updatePage(db: Db, dataDir: string, id: string, author: Author, req: UpdatePage): number {
  const page = db.page(id);
  if (!page) throw new PageError('not_found', 'no such page');
  if (req.expectedVersion !== page.version) {
    throw new PageError('conflict', `the page changed since version ${req.expectedVersion} (now ${page.version}); read it again`);
  }
  if (!req.files?.length && !req.delete?.length) throw new PageError('invalid', 'nothing to change');
  return commit(db, dataDir, page, author, stage(dataDir, id, versionDir(dataDir, id, page.version), req.files ?? [], req.delete ?? []), req.note);
}

/** Make a new version that is a copy of an older one. */
export function restoreVersion(db: Db, dataDir: string, id: string, author: Author, version: number, expectedVersion: number): number {
  const page = db.page(id);
  if (!page) throw new PageError('not_found', 'no such page');
  if (expectedVersion !== page.version) throw new PageError('conflict', `the page changed (now version ${page.version})`);
  const source = versionDir(dataDir, id, version);
  if (version >= page.version || !fs.existsSync(source)) throw new PageError('not_found', `no earlier version ${version}`);
  return commit(db, dataDir, page, author, stage(dataDir, id, source, [], []), `Restored version ${version}`);
}

function commit(db: Db, dataDir: string, page: PageRow, author: Author, staged: { dir: string; files: number; bytes: number }, note?: string): number {
  const next = page.version + 1;
  const target = versionDir(dataDir, page.id, next);
  try {
    fs.renameSync(staged.dir, target);
  } catch (err) {
    fs.rmSync(staged.dir, { recursive: true, force: true });
    if ((err as NodeJS.ErrnoException).code === 'ENOTEMPTY' || (err as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new PageError('conflict', 'the page changed while saving; read it again');
    }
    throw err;
  }
  const at = new Date().toISOString();
  try {
    db.tx(() => {
      if (!db.advanceVersion(page.id, page.version, next, at)) throw new PageError('conflict', 'the page changed while saving; read it again');
      db.insertVersion(versionRow(page.id, next, author, note, staged, at));
    });
  } catch (err) {
    fs.rmSync(target, { recursive: true, force: true });
    throw err;
  }
  return next;
}

export function setDetails(db: Db, id: string, details: { title?: string; description?: string }) {
  const page = db.page(id);
  if (!page) throw new PageError('not_found', 'no such page');
  const title = details.title !== undefined ? cleanTitle(details.title) : page.title;
  const description = details.description !== undefined ? cleanDescription(details.description) : page.description;
  db.setDetails(id, title, description, new Date().toISOString());
}

/** Remove a page, all its versions and shares. */
export function deletePage(db: Db, dataDir: string, id: string) {
  if (!isPageId(id)) return;
  db.deletePage(id);
  const dir = path.join(pagesRoot(dataDir), id);
  if (!fs.existsSync(dir)) return;
  // Rename first so a half-finished removal never leaves a readable page behind.
  const trash = path.join(pagesRoot(dataDir), STAGING, `${id}-deleted-${crypto.randomUUID()}`);
  fs.mkdirSync(path.dirname(trash), { recursive: true });
  fs.renameSync(dir, trash);
  fs.rmSync(trash, { recursive: true, force: true });
}

/** Clear leftovers of interrupted writes. Runs at startup. */
export function cleanStaging(dataDir: string) {
  fs.rmSync(path.join(pagesRoot(dataDir), STAGING), { recursive: true, force: true });
}
