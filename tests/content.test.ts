import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSite, filterEntries, loadEntries, neighbors, parseEntry } from '@/lib/content';
import type { ProgressStatus } from '@/lib/tracks';

const dir = path.join(__dirname, 'fixtures/content');
const entries = loadEntries(dir);
const site = buildSite(entries);
const get = (slug: string) => entries.find((e) => e.slug === slug)!;

describe('parsing', () => {
  it('parses a valid file and normalizes dates', () => {
    const alpha = get('alpha');
    expect(alpha.error).toBeUndefined();
    expect(alpha).toMatchObject({ kind: 'concept', title: 'Alpha', track: 'foundations', level: 1, minutes: 20 });
    expect(alpha.created).toBe('2026-09-01');
    expect(get('beta').updated).toBe('2026-09-10');
  });

  it('defaults the track to papers for paper pages', () => {
    expect(get('gamma-paper').track).toBe('papers');
  });

  it('turns invalid frontmatter into an error entry', () => {
    const broken = get('broken');
    expect(broken.error).toMatch(/concepts\/broken\.mdx/);
    expect(broken.error).toMatch(/level/);
    expect(broken.error).toMatch(/track/);
    expect(broken.title).toBe('broken');
    expect(broken.rawFrontmatter).toContain('level: 9');
  });

  it('requires the paper block and stages by kind', () => {
    const paper = parseEntry('/x/papers/p.mdx', 'papers/p.mdx', 'paper', '---\ntitle: P\nkind: paper\nsummary: s\nlevel: 4\n---\n');
    expect(paper.error).toMatch(/paper: required/);
    const roadmap = parseEntry('/x/roadmaps/r.mdx', 'roadmaps/r.mdx', 'roadmap', '---\ntitle: R\nkind: roadmap\nsummary: s\n---\n');
    expect(roadmap.error).toMatch(/stages: required/);
  });
});

describe('graph', () => {
  it('computes leadsTo as the inverse of prerequisites', () => {
    expect(site.leadsTo.get('alpha')).toEqual(['beta']);
    expect(site.leadsTo.get('beta')).toEqual(['gamma-paper']);
  });

  it('lists missing prerequisites', () => {
    expect(site.missingPrerequisites.get('beta')).toEqual(['not-written-yet']);
    expect(site.missingPrerequisites.has('alpha')).toBe(false);
  });

  it('orders the primary roadmap and track pages', () => {
    expect(site.primaryRoadmap?.slug).toBe('main-path');
    expect(site.primaryOrder).toEqual(['alpha', 'beta', 'gamma-paper']);
    expect(neighbors(site.primaryOrder, 'beta')).toEqual({ prev: 'alpha', next: 'gamma-paper' });
    expect(site.tracks.find((t) => t.id === 'papers')?.pages.map((p) => p.slug)).toEqual(['gamma-paper']);
    expect(site.tagCounts.get('probability')).toBe(2);
  });
});

describe('filters', () => {
  const progress: Record<string, ProgressStatus> = { alpha: 'done', beta: 'in-progress' };
  const statusOf = (slug: string) => progress[slug] ?? 'not-started';
  const slugs = (f: Parameters<typeof filterEntries>[1]) => filterEntries(entries, f, statusOf).map((e) => e.slug);

  it('filters by kind, track, level, tag, query, and status', () => {
    expect(slugs({ kind: 'paper' })).toEqual(['gamma-paper']);
    expect(slugs({ track: 'stochastic-analysis' })).toEqual(['beta']);
    expect(slugs({ level: '1' })).toEqual(['alpha']);
    expect(slugs({ tag: 'sde' })).toEqual(['beta', 'gamma-paper']);
    expect(slugs({ q: 'needs BETA' })).toEqual(['gamma-paper']);
    expect(slugs({ status: 'done' })).toEqual(['alpha']);
    expect(slugs({ status: 'in-progress', tag: 'probability' })).toEqual(['beta']);
  });

  it('sorts by updated, newest first', () => {
    expect(slugs({ kind: 'concept', sort: 'updated' }).slice(0, 2)).toEqual(['beta', 'alpha']);
  });
});
