import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { ProgressStatus } from './tracks';

// Loaded at runtime so the bundler never sees a static import of node:sqlite.
function sqlite(): typeof import('node:sqlite') {
  return process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
}

export interface ProgressRow {
  slug: string;
  status: ProgressStatus;
  notes: string | null;
  updated_at: string;
}

export type LogEvent = 'view' | 'status';

export function dataDir(): string {
  return path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS progress (
  slug TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('not-started', 'in-progress', 'done')),
  notes TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reading_log (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('view', 'status')),
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reading_log_slug_at ON reading_log (slug, at);
`;

/** Calendar day in local time, YYYY-MM-DD. */
export function localDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d - 1));
}

export interface ProgressStore {
  db: DatabaseSync;
  getAllProgress(): ProgressRow[];
  getProgress(slug: string): ProgressRow | undefined;
  setProgress(slug: string, status: ProgressStatus, notes?: string, now?: Date): ProgressRow;
  /** Returns false when a view was already logged for this slug today. */
  logEvent(slug: string, event: LogEvent, now?: Date): boolean;
  getStreak(today?: Date): number;
  getRecent(n: number): string[];
  getStats(pages: { slug: string; minutes?: number }[]): Stats;
  close(): void;
}

export interface Stats {
  done: number;
  inProgress: number;
  total: number;
  doneMinutes: number;
}

export function openProgressStore(dir: string = dataDir()): ProgressStore {
  fs.mkdirSync(dir, { recursive: true });
  const db = new (sqlite().DatabaseSync)(path.join(dir, 'progress.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 3000;');
  db.exec(SCHEMA);

  const selectAll = db.prepare('SELECT slug, status, notes, updated_at FROM progress ORDER BY slug');
  const selectOne = db.prepare('SELECT slug, status, notes, updated_at FROM progress WHERE slug = ?');
  const upsert = db.prepare(`
    INSERT INTO progress (slug, status, notes, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET status = excluded.status, notes = excluded.notes, updated_at = excluded.updated_at
  `);
  const insertLog = db.prepare('INSERT INTO reading_log (slug, event, at) VALUES (?, ?, ?)');
  const lastView = db.prepare("SELECT at FROM reading_log WHERE slug = ? AND event = 'view' ORDER BY at DESC LIMIT 1");
  const allEventTimes = db.prepare('SELECT at FROM reading_log ORDER BY at DESC');
  const recent = db.prepare(
    "SELECT slug, MAX(at) AS last FROM reading_log WHERE event = 'view' GROUP BY slug ORDER BY last DESC LIMIT ?",
  );

  const store: ProgressStore = {
    db,
    getAllProgress: () => selectAll.all() as unknown as ProgressRow[],
    getProgress: (slug) => selectOne.get(slug) as unknown as ProgressRow | undefined,
    setProgress(slug, status, notes, now = new Date()) {
      const existing = store.getProgress(slug);
      const nextNotes = notes !== undefined ? notes : (existing?.notes ?? null);
      upsert.run(slug, status, nextNotes, now.toISOString());
      if (existing?.status !== status) insertLog.run(slug, 'status', now.toISOString());
      return store.getProgress(slug)!;
    },
    logEvent(slug, event, now = new Date()) {
      if (event === 'view') {
        const last = lastView.get(slug) as { at: string } | undefined;
        if (last && localDay(new Date(last.at)) === localDay(now)) return false;
      }
      insertLog.run(slug, event, now.toISOString());
      return true;
    },
    getStreak(today = new Date()) {
      const days = new Set((allEventTimes.all() as { at: string }[]).map((r) => localDay(new Date(r.at))));
      let day = localDay(today);
      if (!days.has(day)) day = previousDay(day);
      let streak = 0;
      while (days.has(day)) {
        streak += 1;
        day = previousDay(day);
      }
      return streak;
    },
    getRecent: (n) => (recent.all(n) as { slug: string }[]).map((r) => r.slug),
    getStats(pages) {
      const status = new Map(store.getAllProgress().map((r) => [r.slug, r.status]));
      let done = 0;
      let inProgress = 0;
      let doneMinutes = 0;
      for (const p of pages) {
        const s = status.get(p.slug);
        if (s === 'done') {
          done += 1;
          doneMinutes += p.minutes ?? 0;
        } else if (s === 'in-progress') inProgress += 1;
      }
      return { done, inProgress, total: pages.length, doneMinutes };
    },
    close: () => db.close(),
  };
  return store;
}

// Process-wide store for the running site, keyed by DATA_DIR.
const g = globalThis as unknown as { __marginaliaStore?: { dir: string; store: ProgressStore } };

export function store(): ProgressStore {
  const dir = dataDir();
  if (!g.__marginaliaStore || g.__marginaliaStore.dir !== dir) {
    g.__marginaliaStore = { dir, store: openProgressStore(dir) };
  }
  return g.__marginaliaStore.store;
}

export const getAllProgress = () => store().getAllProgress();
export const getProgress = (slug: string) => store().getProgress(slug);
export const setProgress = (slug: string, status: ProgressStatus, notes?: string) => store().setProgress(slug, status, notes);
export const logEvent = (slug: string, event: LogEvent) => store().logEvent(slug, event);
export const getStreak = (today?: Date) => store().getStreak(today);
export const getRecent = (n: number) => store().getRecent(n);
export const getStats = (pages: { slug: string; minutes?: number }[]) => store().getStats(pages);

/** Map of slug to status, defaulting to not-started. */
export function progressLookup(): (slug: string) => ProgressStatus {
  const map = new Map(getAllProgress().map((r) => [r.slug, r.status]));
  return (slug) => map.get(slug) ?? 'not-started';
}
