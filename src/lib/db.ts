import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { ProgressStatus } from './kinds';

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

// Progress is per user (Better Auth user id). Version 1 had no user_id; see migrate().
const SCHEMA = `
CREATE TABLE IF NOT EXISTS progress (
  user_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('not-started', 'in-progress', 'done')),
  notes TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, slug)
);
CREATE TABLE IF NOT EXISTS reading_log (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('view', 'status')),
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reading_log_user_at ON reading_log (user_id, at);
CREATE INDEX IF NOT EXISTS reading_log_user_slug_at ON reading_log (user_id, slug, at);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  user_id TEXT NOT NULL,
  key_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  ok INTEGER NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS audit_log_at ON audit_log (at);
`;

/** Move single-user tables aside (dropping them when empty) so the per-user schema can be created. */
function migrate(db: DatabaseSync) {
  for (const table of ['progress', 'reading_log']) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (columns.length === 0 || columns.some((c) => c.name === 'user_id')) continue;
    const { n } = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
    if (n === 0) db.exec(`DROP TABLE ${table}`);
    else db.exec(`ALTER TABLE ${table} RENAME TO ${table}_single_user`);
  }
  db.exec('DROP INDEX IF EXISTS reading_log_slug_at');
}

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

/** One user's progress. */
export interface UserProgress {
  getAllProgress(): ProgressRow[];
  getProgress(slug: string): ProgressRow | undefined;
  setProgress(slug: string, status: ProgressStatus, notes?: string, now?: Date): ProgressRow;
  /** Returns false when a view was already logged for this slug today. */
  logEvent(slug: string, event: LogEvent, now?: Date): boolean;
  getStreak(today?: Date): number;
  getRecent(n: number): string[];
  getStats(pages: { slug: string; minutes?: number }[]): Stats;
}

export interface ProgressStore {
  db: DatabaseSync;
  user(userId: string): UserProgress;
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
  migrate(db);
  db.exec(SCHEMA);

  const selectAll = db.prepare('SELECT slug, status, notes, updated_at FROM progress WHERE user_id = ? ORDER BY slug');
  const selectOne = db.prepare('SELECT slug, status, notes, updated_at FROM progress WHERE user_id = ? AND slug = ?');
  const upsert = db.prepare(`
    INSERT INTO progress (user_id, slug, status, notes, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, slug) DO UPDATE SET status = excluded.status, notes = excluded.notes, updated_at = excluded.updated_at
  `);
  const insertLog = db.prepare('INSERT INTO reading_log (user_id, slug, event, at) VALUES (?, ?, ?, ?)');
  const lastView = db.prepare(
    "SELECT at FROM reading_log WHERE user_id = ? AND slug = ? AND event = 'view' ORDER BY at DESC LIMIT 1",
  );
  const allEventTimes = db.prepare('SELECT at FROM reading_log WHERE user_id = ? ORDER BY at DESC');
  const recent = db.prepare(
    "SELECT slug, MAX(at) AS last FROM reading_log WHERE user_id = ? AND event = 'view' GROUP BY slug ORDER BY last DESC LIMIT ?",
  );

  function user(userId: string): UserProgress {
    const progress: UserProgress = {
      getAllProgress: () => selectAll.all(userId) as unknown as ProgressRow[],
      getProgress: (slug) => selectOne.get(userId, slug) as unknown as ProgressRow | undefined,
      setProgress(slug, status, notes, now = new Date()) {
        const existing = progress.getProgress(slug);
        const nextNotes = notes !== undefined ? notes : (existing?.notes ?? null);
        upsert.run(userId, slug, status, nextNotes, now.toISOString());
        if (existing?.status !== status) insertLog.run(userId, slug, 'status', now.toISOString());
        return progress.getProgress(slug)!;
      },
      logEvent(slug, event, now = new Date()) {
        if (event === 'view') {
          const last = lastView.get(userId, slug) as { at: string } | undefined;
          if (last && localDay(new Date(last.at)) === localDay(now)) return false;
        }
        insertLog.run(userId, slug, event, now.toISOString());
        return true;
      },
      getStreak(today = new Date()) {
        const days = new Set((allEventTimes.all(userId) as { at: string }[]).map((r) => localDay(new Date(r.at))));
        let day = localDay(today);
        if (!days.has(day)) day = previousDay(day);
        let streak = 0;
        while (days.has(day)) {
          streak += 1;
          day = previousDay(day);
        }
        return streak;
      },
      getRecent: (n) => (recent.all(userId, n) as { slug: string }[]).map((r) => r.slug),
      getStats(pages) {
        const status = new Map(progress.getAllProgress().map((r) => [r.slug, r.status]));
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
    };
    return progress;
  }

  return { db, user, close: () => db.close() };
}

// Process-wide store for the running site, keyed by DATA_DIR.
const g = globalThis as unknown as { __hatcherStore?: { dir: string; store: ProgressStore } };

export function store(): ProgressStore {
  const dir = dataDir();
  if (!g.__hatcherStore || g.__hatcherStore.dir !== dir) {
    g.__hatcherStore = { dir, store: openProgressStore(dir) };
  }
  return g.__hatcherStore.store;
}

/** Progress for a signed-in user. */
export function userProgress(userId: string): UserProgress {
  return store().user(userId);
}

/** Map of slug to status for a user (or nobody, when signed out), defaulting to not-started. */
export function progressLookup(userId: string | null | undefined): (slug: string) => ProgressStatus {
  if (!userId) return () => 'not-started';
  const map = new Map(userProgress(userId).getAllProgress().map((r) => [r.slug, r.status]));
  return (slug) => map.get(slug) ?? 'not-started';
}

export interface AuditRecord {
  userId: string;
  keyId?: string;
  action: string;
  target?: string;
  ok: boolean;
  detail?: string;
}

/** Append to the audit log of agent changes (DATA_DIR/progress.db, table audit_log). */
export function recordAudit(r: AuditRecord) {
  store()
    .db.prepare('INSERT INTO audit_log (at, user_id, key_id, action, target, ok, detail) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(new Date().toISOString(), r.userId, r.keyId ?? null, r.action, r.target ?? null, r.ok ? 1 : 0, r.detail?.slice(0, 2000) ?? null);
}
