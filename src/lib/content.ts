import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { formatZodError, frontmatterSchema, type PaperMeta, type Source, type Stage } from './schema';
import { KIND_DIRS, KINDS, TRACKS, type Kind, type ProgressStatus, type TrackId } from './tracks';

export interface Entry {
  slug: string;
  kind: Kind;
  /** Absolute path of the MDX file. */
  file: string;
  /** Path relative to the content directory, e.g. concepts/ito-lemma.mdx. */
  relPath: string;
  title: string;
  summary: string;
  tags: string[];
  track?: TrackId;
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
  /** MDX body without frontmatter. */
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

export function parseEntry(file: string, relPath: string, kind: Kind, source: string): Entry {
  const slug = path.basename(file, '.mdx');
  const base: Entry = {
    slug,
    kind,
    file,
    relPath,
    title: slug,
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
    track: fm.track,
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

const globalCache = globalThis as unknown as { __marginaliaContentCache?: Map<string, CacheSlot> };
const cache: Map<string, CacheSlot> = (globalCache.__marginaliaContentCache ??= new Map());

/** List and parse every entry. The directory is re-listed on every call; unchanged files come from cache. */
export function loadEntries(dir: string = contentDir()): Entry[] {
  const entries: Entry[] = [];
  const seen = new Set<string>();
  for (const kind of KINDS) {
    const kindDir = path.join(dir, KIND_DIRS[kind]);
    let names: string[];
    try {
      names = fs.readdirSync(kindDir);
    } catch {
      continue;
    }
    for (const name of names.sort()) {
      if (!name.endsWith('.mdx') || name.startsWith('.')) continue;
      const file = path.join(kindDir, name);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(file);
      } catch {
        continue; // removed between readdir and stat
      }
      if (!stat.isFile()) continue;
      seen.add(file);
      const slot = cache.get(file);
      if (slot && slot.mtimeMs === stat.mtimeMs && slot.size === stat.size) {
        entries.push(slot.entry);
        continue;
      }
      let source: string;
      try {
        source = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const entry = parseEntry(file, path.relative(dir, file), kind, source);
      cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, entry });
      entries.push(entry);
    }
  }
  for (const key of cache.keys()) {
    if (key.startsWith(dir + path.sep) && !seen.has(key)) cache.delete(key);
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Derived data (pure)

export interface TrackGroup {
  id: TrackId;
  name: string;
  description: string;
  pages: Entry[];
}

export interface Site {
  entries: Entry[];
  /** Valid concept and paper pages. */
  pages: Entry[];
  roadmaps: Entry[];
  bySlug: Map<string, Entry>;
  leadsTo: Map<string, string[]>;
  missingPrerequisites: Map<string, string[]>;
  tracks: TrackGroup[];
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

  const tracks: TrackGroup[] = TRACKS.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    pages: pages.filter((p) => p.track === t.id).sort(byLevelThenTitle),
  }));

  const tagCounts = new Map<string, number>();
  for (const e of valid) for (const tag of e.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);

  const primaryRoadmap = roadmaps.find((r) => r.primary) ?? roadmaps[0];
  const primaryOrder = primaryRoadmap ? roadmapOrder(primaryRoadmap).filter((s) => bySlug.has(s)) : [];

  return { entries, pages, roadmaps, bySlug, leadsTo, missingPrerequisites, tracks, tagCounts, primaryRoadmap, primaryOrder };
}

export function getSite(dir: string = contentDir()): Site {
  return buildSite(loadEntries(dir));
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
  track?: string;
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
    if (filters.track && e.track !== filters.track) return false;
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
