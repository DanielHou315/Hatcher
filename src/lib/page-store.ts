// Reading and writing pages in CONTENT_DIR on behalf of agents (the MCP endpoint).
//
// Writes are staged: the page folder is copied into CONTENT_DIR/.staging/, edited there, parsed and
// validated, and only then swapped into place with renames on the same filesystem. A failed or
// invalid write leaves the live page untouched. Writes to an existing page must name the version
// they were based on, so an agent cannot overwrite changes it has not seen.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadEntries, parseEntry, type Entry } from './content';
import { CONTENT_TYPES } from './sandbox';
import { KIND_DIRS, type Kind } from './tracks';
import { validateEntry, type Problems } from './validate';

const MB = 1024 * 1024;
export const LIMITS = { files: 200, fileBytes: 2 * MB, pageBytes: 10 * MB, depth: 4 } as const;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const ALLOWED_EXTS = new Set(['.mdx', ...Object.keys(CONTENT_TYPES)]);
const MAIN_FILES = ['index.mdx', 'index.html'] as const;
const STAGING = '.staging';

export type PageErrorCode = 'not_found' | 'invalid' | 'conflict' | 'forbidden' | 'too_large';

export class PageError extends Error {
  constructor(
    readonly code: PageErrorCode,
    message: string,
    readonly problems?: Problems,
  ) {
    super(message);
  }
}

export function checkSlug(slug: string): string {
  if (!SLUG_RE.test(slug)) throw new PageError('invalid', `slug "${slug}" must be lowercase letters, digits and hyphens (max 80)`);
  return slug;
}

/** A file path inside a page folder: relative, forward slashes, no dot segments, allowed extension. */
export function checkFilePath(p: string): string {
  const segments = p.split('/');
  if (segments.length > LIMITS.depth || segments.some((s) => !SEGMENT_RE.test(s))) {
    throw new PageError('invalid', `path "${p}" must be relative, at most ${LIMITS.depth} levels, and use only letters, digits, ".", "_" and "-" (no leading dots)`);
  }
  const ext = path.extname(p).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) throw new PageError('invalid', `path "${p}": file type ${ext || '(none)'} is not allowed`);
  return segments.join('/');
}

export interface PageFile {
  path: string;
  size: number;
}

export interface Located {
  kind: Kind;
  slug: string;
  /** Page folder (whether or not it exists). */
  folder: string;
  layout: 'folder' | 'file' | null;
  /** Main file when the page exists: the flat file or the folder's index. */
  main?: string;
}

export function locate(dir: string, kind: Kind, slug: string): Located {
  checkSlug(slug);
  const kindDir = path.join(dir, KIND_DIRS[kind]);
  const folder = path.join(kindDir, slug);
  const indexes = MAIN_FILES.map((f) => path.join(folder, f)).filter((f) => fs.existsSync(f));
  const flats = ['.mdx', '.html'].map((e) => path.join(kindDir, slug + e)).filter((f) => fs.existsSync(f));
  const found = [...indexes, ...flats];
  if (found.length > 1) {
    const rel = found.map((f) => path.relative(dir, f)).join(', ');
    throw new PageError('conflict', `${kind} "${slug}" exists more than once (${rel}); fix it on the server`);
  }
  if (indexes.length) return { kind, slug, folder, layout: 'folder', main: indexes[0] };
  if (flats.length) return { kind, slug, folder, layout: 'file', main: flats[0] };
  return { kind, slug, folder, layout: null };
}

/** Files of a page, keyed by their path inside the page folder. A flat page is shown as its index file. */
function filesOf(loc: Located): Map<string, string> {
  const files = new Map<string, string>();
  if (loc.layout === 'file') files.set(`index${path.extname(loc.main!)}`, loc.main!);
  if (loc.layout === 'folder') {
    for (const d of fs.readdirSync(loc.folder, { recursive: true, withFileTypes: true })) {
      if (!d.isFile()) continue;
      const abs = path.join(d.parentPath, d.name);
      files.set(path.relative(loc.folder, abs).split(path.sep).join('/'), abs);
    }
  }
  return files;
}

/** Content hash of every file in the page; changes whenever any file does. */
function versionOf(files: Map<string, string>): string {
  const h = crypto.createHash('sha256');
  for (const p of [...files.keys()].sort()) {
    h.update(p).update('\0').update(crypto.createHash('sha256').update(fs.readFileSync(files.get(p)!)).digest()).update('\0');
  }
  return h.digest('hex').slice(0, 16);
}

export interface PageSnapshot {
  loc: Located;
  entry: Entry;
  source: string;
  files: PageFile[];
  version: string;
}

export function readPage(dir: string, kind: Kind, slug: string): PageSnapshot {
  const loc = locate(dir, kind, slug);
  if (!loc.layout) throw new PageError('not_found', `no ${kind} "${slug}"`);
  const files = filesOf(loc);
  const source = fs.readFileSync(loc.main!, 'utf8');
  const entry = parseEntry(loc.main!, path.relative(dir, loc.main!), kind, source);
  return {
    loc,
    entry,
    source,
    files: [...files].map(([p, abs]) => ({ path: p, size: fs.statSync(abs).size })).sort((a, b) => a.path.localeCompare(b.path)),
    version: versionOf(files),
  };
}

export function readPageFile(dir: string, kind: Kind, slug: string, filePath: string): Buffer {
  const files = filesOf(locate(dir, kind, slug));
  const abs = files.get(checkFilePath(filePath));
  if (!abs) throw new PageError('not_found', `no file "${filePath}" in ${kind} "${slug}"`);
  return fs.readFileSync(abs);
}

export interface FileWrite {
  path: string;
  /** UTF-8 text. */
  text?: string;
  /** Binary content (images, fonts, ...). */
  base64?: string;
}

export interface WriteRequest {
  kind: Kind;
  slug: string;
  files: FileWrite[];
  /** Paths to remove from the page folder. */
  delete?: string[];
  /** Version from readPage; required when the page exists, omitted when creating it. */
  expectedVersion?: string;
}

export interface Staged {
  dir: string;
  loc: Located;
  stage: string;
  entry: Entry;
  version: string;
  /** Status of the page before this write, or null when it is new. */
  previousStatus: Entry['status'] | null;
  problems: Problems;
}

function decode(f: FileWrite): Buffer {
  if ((f.text === undefined) === (f.base64 === undefined)) {
    throw new PageError('invalid', `file "${f.path}": give exactly one of text or base64`);
  }
  return f.text !== undefined ? Buffer.from(f.text, 'utf8') : Buffer.from(f.base64!, 'base64');
}

function checkVersion(loc: Located, current: string | null, expected: string | undefined) {
  if (current === null && expected !== undefined) {
    throw new PageError('conflict', `${loc.kind} "${loc.slug}" does not exist; omit expected_version to create it`);
  }
  if (current !== null && expected === undefined) {
    throw new PageError('conflict', `${loc.kind} "${loc.slug}" exists; read it with get_page and pass its version as expected_version`);
  }
  if (current !== null && expected !== current) {
    throw new PageError('conflict', `${loc.kind} "${loc.slug}" changed since version ${expected} (now ${current}); read it again`);
  }
}

/**
 * Build the page as it would be after the write, in a staging folder, and validate it. The live
 * page is not touched; call commitStaged or discardStaged next.
 */
export async function stagePage(dir: string, req: WriteRequest): Promise<Staged> {
  const loc = locate(dir, req.kind, req.slug);
  const current = loc.layout ? readPage(dir, req.kind, req.slug) : null;
  checkVersion(loc, current?.version ?? null, req.expectedVersion);
  if (req.files.length + (req.delete?.length ?? 0) === 0) throw new PageError('invalid', 'nothing to write');

  const root = path.join(dir, STAGING);
  fs.mkdirSync(root, { recursive: true });
  const stage = fs.mkdtempSync(path.join(root, `${req.slug}-`));
  try {
    if (loc.layout === 'folder') fs.cpSync(loc.folder, stage, { recursive: true });
    if (loc.layout === 'file') fs.copyFileSync(loc.main!, path.join(stage, `index${path.extname(loc.main!)}`));

    for (const p of req.delete ?? []) {
      const rel = checkFilePath(p);
      const abs = path.join(stage, rel);
      if (!fs.existsSync(abs)) throw new PageError('not_found', `cannot delete "${p}": not in the page`);
      fs.rmSync(abs);
    }
    for (const f of req.files) {
      const rel = checkFilePath(f.path);
      const data = decode(f);
      if (data.length > LIMITS.fileBytes) throw new PageError('too_large', `file "${f.path}" is over ${LIMITS.fileBytes / MB} MB`);
      // Switching formats: writing index.html replaces index.mdx and the reverse.
      if ((MAIN_FILES as readonly string[]).includes(rel)) {
        for (const m of MAIN_FILES) if (m !== rel) fs.rmSync(path.join(stage, m), { force: true });
      }
      fs.mkdirSync(path.dirname(path.join(stage, rel)), { recursive: true });
      fs.writeFileSync(path.join(stage, rel), data);
    }

    const staged = filesOf({ ...loc, folder: stage, layout: 'folder' });
    let total = 0;
    for (const abs of staged.values()) total += fs.statSync(abs).size;
    if (staged.size > LIMITS.files) throw new PageError('too_large', `a page may hold at most ${LIMITS.files} files`);
    if (total > LIMITS.pageBytes) throw new PageError('too_large', `a page may hold at most ${LIMITS.pageBytes / MB} MB`);
    const main = MAIN_FILES.find((m) => staged.has(m));
    if (!main) throw new PageError('invalid', 'a page needs index.mdx or index.html');

    const mainAbs = path.join(stage, main);
    const relPath = `${KIND_DIRS[req.kind]}/${req.slug}/${main}`;
    const entry = parseEntry(mainAbs, relPath, req.kind, fs.readFileSync(mainAbs, 'utf8'));
    const problems = await validateEntry(entry);
    const clash = loadEntries(dir).find((e) => e.slug === req.slug && e.kind !== req.kind);
    if (clash) problems.errors.push(`slug "${req.slug}" is already used by ${clash.relPath}; slugs are unique across kinds`);

    return { dir, loc, stage, entry, version: versionOf(staged), previousStatus: current?.entry.status ?? null, problems };
  } catch (err) {
    fs.rmSync(stage, { recursive: true, force: true });
    throw err;
  }
}

export function discardStaged(staged: Staged) {
  fs.rmSync(staged.stage, { recursive: true, force: true });
}

/** Swap the staged folder into place. A flat page becomes a page folder. */
export function commitStaged(staged: Staged) {
  const { loc, stage, dir } = staged;
  const trash = fs.mkdtempSync(path.join(dir, STAGING, `${loc.slug}-old-`));
  const moved = loc.layout === 'folder' ? loc.folder : loc.layout === 'file' ? loc.main! : null;
  const parked = moved ? path.join(trash, path.basename(moved)) : null;
  if (moved) fs.renameSync(moved, parked!);
  try {
    fs.mkdirSync(path.dirname(loc.folder), { recursive: true });
    fs.renameSync(stage, loc.folder);
  } catch (err) {
    if (moved) fs.renameSync(parked!, moved);
    throw err;
  }
  fs.rmSync(trash, { recursive: true, force: true });
}

export function deletePage(dir: string, kind: Kind, slug: string, expectedVersion: string) {
  const page = readPage(dir, kind, slug);
  checkVersion(page.loc, page.version, expectedVersion);
  const target = page.loc.layout === 'folder' ? page.loc.folder : page.loc.main!;
  fs.mkdirSync(path.join(dir, STAGING), { recursive: true });
  const trash = fs.mkdtempSync(path.join(dir, STAGING, `${slug}-deleted-`));
  fs.renameSync(target, path.join(trash, path.basename(target)));
  fs.rmSync(trash, { recursive: true, force: true });
}

const STATUS_LINE = /^status:[^\n]*$/m;

/** Set the frontmatter `status` of a page, keeping the rest of the file byte for byte. */
export function setStatus(dir: string, kind: Kind, slug: string, status: Entry['status'], expectedVersion: string): string {
  const page = readPage(dir, kind, slug);
  checkVersion(page.loc, page.version, expectedVersion);
  if (page.entry.error) throw new PageError('invalid', `fix the page first: ${page.entry.error}`);
  const fm = /^(﻿?---\r?\n)([\s\S]*?)(\r?\n---)/.exec(page.source);
  if (!fm) throw new PageError('invalid', 'the page has no frontmatter');
  const body = STATUS_LINE.test(fm[2]) ? fm[2].replace(STATUS_LINE, `status: ${status}`) : `${fm[2]}\nstatus: ${status}`;
  const next = fm[1] + body + fm[3] + page.source.slice(fm[0].length);
  const tmp = `${page.loc.main!}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, next);
  fs.renameSync(tmp, page.loc.main!);
  return readPage(dir, kind, slug).version;
}

const locks = new Map<string, Promise<unknown>>();

/** Run page mutations one at a time per page within this process. */
export function withPageLock<T>(kind: Kind, slug: string, fn: () => Promise<T> | T): Promise<T> {
  const key = `${kind}/${slug}`;
  const run = (locks.get(key) ?? Promise.resolve()).catch(() => undefined).then(fn);
  locks.set(key, run);
  // Cleanup must not re-raise the caller's error as an unhandled rejection.
  run.then(
    () => undefined,
    () => undefined,
  ).then(() => {
    if (locks.get(key) === run) locks.delete(key);
  });
  return run;
}
