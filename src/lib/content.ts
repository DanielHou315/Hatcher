import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { formatZodError, frontmatterSchema, type PaperMeta, type Source, type Stage } from './schema';
import { KIND_DIRS, KINDS, type Kind, type ProgressStatus } from './kinds';

/** How the body is written: MDX rendered by the site, or HTML rendered in a sandboxed frame. */
export type Format = 'mdx' | 'html';

export interface Entry {
  slug: string;
  kind: Kind;
  format: Format;
  /** True for a page folder (`<kind>/<slug>/index.{mdx,html}`), which can hold figures and assets. */
  bundle: boolean;
  /** Absolute path of the source file. */
  file: string;
  /** Path relative to the content directory, e.g. concepts/ito-lemma.mdx. */
  relPath: string;
  title: string;
  summary: string;
  tags: string[];
  level?: number;
  prerequisites: string[];
  minutes?: number;
  status: 'draft' | 'ready';
  created?: string;
  updated?: string;
  sources: Source[];
  paper?: PaperMeta;
  stages?: Stage[];
  primary: boolean;
  /** Body (MDX or HTML) without frontmatter. */
  body: string;
  /** Lines before the body in the file, to map body line numbers back to the file. */
  bodyLineOffset: number;
  /** Raw frontmatter text, kept so invalid pages can show it. */
  rawFrontmatter: string;
  /** Set when the file failed to parse or validate. */
  error?: string;
}

export function contentDir(): string {
  return path.resolve(process.env.CONTENT_DIR || path.join(process.cwd(), 'content'));
}

// ---------------------------------------------------------------------------
// Parsing

function rawFrontmatterOf(source: string): string {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  return m ? m[1] : '';
}

const ENTRY_EXTS: Record<string, Format> = { '.mdx': 'mdx', '.html': 'html' };

/** Slug, format and layout of an entry file: `<slug>.<ext>` or `<slug>/index.<ext>`. */
export function entryShape(file: string): { slug: string; format: Format; bundle: boolean } {
  const ext = path.extname(file);
  const name = path.basename(file, ext);
  const bundle = name === 'index';
  return { slug: bundle ? path.basename(path.dirname(file)) : name, format: ENTRY_EXTS[ext] ?? 'mdx', bundle };
}

export function parseEntry(file: string, relPath: string, kind: Kind, source: string): Entry {
  const shape = entryShape(file);
  const base: Entry = {
    ...shape,
    kind,
    file,
    relPath,
    title: shape.slug,
    summary: '',
    tags: [],
    prerequisites: [],
    status: 'ready',
    sources: [],
    primary: false,
    body: '',
    bodyLineOffset: 0,
    rawFrontmatter: rawFrontmatterOf(source),
  };
  let parsed: matter.GrayMatterFile<string>;
  try {
    // Passing options disables gray-matter's unbounded internal cache.
    parsed = matter(source, {});
  } catch (err) {
    return { ...base, error: `${relPath}: could not parse frontmatter: ${(err as Error).message}` };
  }
  base.body = parsed.content;
  const prefix = source.slice(0, Math.max(0, source.length - parsed.content.length));
  base.bodyLineOffset = (prefix.match(/\n/g) ?? []).length;
  const result = frontmatterSchema.safeParse(parsed.data);
  if (!result.success) {
    return { ...base, error: `${relPath}: ${formatZodError(result.error)}` };
  }
  const fm = result.data;
  if (fm.kind !== kind) {
    return { ...base, error: `${relPath}: kind "${fm.kind}" does not match directory ${KIND_DIRS[kind]}/` };
  }
  return {
    ...base,
    title: fm.title,
    summary: fm.summary,
    tags: fm.tags,
    level: fm.level,
    prerequisites: fm.prerequisites,
    minutes: fm.estimated_minutes,
    status: fm.status,
    created: fm.created,
    updated: fm.updated,
    sources: fm.sources,
    paper: fm.paper,
    stages: fm.stages,
    primary: fm.primary,
  };
}

// ---------------------------------------------------------------------------
// Loading with an mtime/size keyed cache

interface CacheSlot {
  mtimeMs: number;
  size: number;
  entry: Entry;
}

const globalCache = globalThis as unknown as { __hatcherContentCache?: Map<string, CacheSlot> };
const cache: Map<string, CacheSlot> = (globalCache.__hatcherContentCache ??= new Map());

/**
 * Entry files in one kind directory, grouped by slug. A slug is either a flat file
 * (`<slug>.mdx`, `<slug>.html`) or a page folder holding `index.mdx` or `index.html`.
 */
function entryFiles(kindDir: string): Map<string, string[]> {
  const bySlug = new Map<string, string[]>();
  let names: string[];
  try {
    names = fs.readdirSync(kindDir);
  } catch {
    return bySlug;
  }
  for (const name of names.sort()) {
    if (name.startsWith('.')) continue;
    const full = path.join(kindDir, name);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue; // removed between readdir and stat
    }
    const candidates: string[] = [];
    if (stat.isFile() && ENTRY_EXTS[path.extname(name)]) candidates.push(full);
    if (stat.isDirectory()) {
      for (const index of ['index.mdx', 'index.html']) {
        if (fs.existsSync(path.join(full, index))) candidates.push(path.join(full, index));
      }
    }
    for (const file of candidates) {
      const { slug } = entryShape(file);
      bySlug.set(slug, [...(bySlug.get(slug) ?? []), file]);
    }
  }
  return bySlug;
}

function readEntry(file: string, dir: string, kind: Kind): Entry | undefined {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return undefined;
  }
  const slot = cache.get(file);
  if (slot && slot.mtimeMs === stat.mtimeMs && slot.size === stat.size) return slot.entry;
  let source: string;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  const entry = parseEntry(file, path.relative(dir, file), kind, source);
  cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, entry });
  return entry;
}

/** List and parse every entry. The directory is re-listed on every call; unchanged files come from cache. */
export function loadEntries(dir: string = contentDir()): Entry[] {
  const entries: Entry[] = [];
  const seen = new Set<string>();
  for (const kind of KINDS) {
    for (const files of entryFiles(path.join(dir, KIND_DIRS[kind])).values()) {
      for (const file of files) seen.add(file);
      const entry = readEntry(files[0], dir, kind);
      if (!entry) continue;
      if (files.length > 1) {
        const others = files.slice(1).map((f) => path.relative(dir, f));
        entries.push({ ...entry, error: `${entry.relPath}: slug "${entry.slug}" is also used by ${others.join(', ')}; keep one` });
      } else {
        entries.push(entry);
      }
    }
  }
  for (const key of cache.keys()) {
    if (key.startsWith(dir + path.sep) && !seen.has(key)) cache.delete(key);
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Derived data (pure)

export interface Site {
  entries: Entry[];
  /** Valid concept and paper pages. */
  pages: Entry[];
  roadmaps: Entry[];
  bySlug: Map<string, Entry>;
  leadsTo: Map<string, string[]>;
  missingPrerequisites: Map<string, string[]>;
  tagCounts: Map<string, number>;
  primaryRoadmap?: Entry;
  /** Slugs of the primary roadmap in reading order (only slugs that exist). */
  primaryOrder: string[];
}

export function byLevelThenTitle(a: Entry, b: Entry): number {
  return (a.level ?? 99) - (b.level ?? 99) || a.title.localeCompare(b.title);
}

export function roadmapOrder(roadmap: Entry): string[] {
  const out: string[] = [];
  for (const stage of roadmap.stages ?? []) {
    for (const item of stage.items) if (!out.includes(item)) out.push(item);
  }
  return out;
}

export function buildSite(entries: Entry[]): Site {
  const valid = entries.filter((e) => !e.error);
  const pages = valid.filter((e) => e.kind !== 'roadmap');
  const roadmaps = valid.filter((e) => e.kind === 'roadmap').sort((a, b) => a.title.localeCompare(b.title));

  const bySlug = new Map<string, Entry>();
  for (const e of [...pages, ...roadmaps]) if (!bySlug.has(e.slug)) bySlug.set(e.slug, e);

  const leadsTo = new Map<string, string[]>();
  const missingPrerequisites = new Map<string, string[]>();
  for (const page of valid) {
    const missing: string[] = [];
    for (const pre of page.prerequisites) {
      if (!bySlug.has(pre)) missing.push(pre);
      const list = leadsTo.get(pre) ?? [];
      if (!list.includes(page.slug)) list.push(page.slug);
      leadsTo.set(pre, list);
    }
    if (missing.length) missingPrerequisites.set(page.slug, missing);
  }

  const tagCounts = new Map<string, number>();
  for (const e of valid) for (const tag of e.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);

  const primaryRoadmap = roadmaps.find((r) => r.primary) ?? roadmaps[0];
  const primaryOrder = primaryRoadmap ? roadmapOrder(primaryRoadmap).filter((s) => bySlug.has(s)) : [];

  return { entries, pages, roadmaps, bySlug, leadsTo, missingPrerequisites, tagCounts, primaryRoadmap, primaryOrder };
}

/** Entries a viewer may see: published, valid pages, plus drafts and invalid pages for writers. */
export function visibleEntries(entries: Entry[], drafts: boolean): Entry[] {
  return drafts ? entries : entries.filter((e) => !e.error && e.status === 'ready');
}

/** The site as one viewer sees it. Drafts are hidden unless `drafts` is set. */
export function getSite(opts: { drafts?: boolean } = {}, dir: string = contentDir()): Site {
  return buildSite(visibleEntries(loadEntries(dir), opts.drafts ?? false));
}

export function findEntry(site: Site, kind: Kind, slug: string): Entry | undefined {
  return site.entries.find((e) => e.kind === kind && e.slug === slug);
}

/** Previous and next slugs around `slug` in the primary roadmap order. */
export function neighbors(order: string[], slug: string): { prev?: string; next?: string } {
  const i = order.indexOf(slug);
  if (i < 0) return {};
  return { prev: order[i - 1], next: order[i + 1] };
}

// ---------------------------------------------------------------------------
// Filtering (pure)

export interface Filters {
  q?: string;
  kind?: string;
  level?: string;
  status?: string;
  tag?: string;
  sort?: string;
}

export type ProgressLookup = (slug: string) => ProgressStatus;

export function filterEntries(entries: Entry[], filters: Filters, progressOf: ProgressLookup): Entry[] {
  const tokens = (filters.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const level = filters.level ? Number(filters.level) : undefined;
  const out = entries.filter((e) => {
    if (filters.kind && e.kind !== filters.kind) return false;
    if (level !== undefined && e.level !== level) return false;
    if (filters.tag && !e.tags.includes(filters.tag)) return false;
    if (filters.status && progressOf(e.slug) !== filters.status) return false;
    if (tokens.length) {
      const hay = [e.title, e.summary, e.slug, ...e.tags].join(' ').toLowerCase();
      if (!tokens.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
  return sortEntries(out, filters.sort);
}

export function sortEntries(entries: Entry[], sort: string | undefined): Entry[] {
  const list = [...entries];
  if (sort === 'level') return list.sort(byLevelThenTitle);
  if (sort === 'updated') {
    return list.sort((a, b) => (b.updated ?? b.created ?? '').localeCompare(a.updated ?? a.created ?? '') || a.title.localeCompare(b.title));
  }
  return list.sort((a, b) => a.title.localeCompare(b.title));
}

/** Most recently added or updated valid entries. */
export function recentEntries(entries: Entry[], n: number): Entry[] {
  return sortEntries(entries.filter((e) => !e.error), 'updated').slice(0, n);
}
