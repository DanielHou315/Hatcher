import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { openProgressStore, type ProgressStore, type UserProgress } from '@/lib/db';

let dir: string;
let db: ProgressStore;
let store: UserProgress;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hatcher-db-'));
  db = openProgressStore(dir);
  store = db.user('u1');
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

// Local-time dates so streak math does not depend on the machine's time zone.
const at = (d: number, h = 12) => new Date(2026, 8, d, h);

describe('progress store', () => {
  it('sets and gets progress, keeping notes when omitted', () => {
    store.setProgress('ito-lemma', 'in-progress', 'halfway');
    store.setProgress('ito-lemma', 'done');
    expect(store.getProgress('ito-lemma')).toMatchObject({ status: 'done', notes: 'halfway' });
    expect(store.getAllProgress()).toHaveLength(1);
    expect(fs.existsSync(path.join(dir, 'progress.db'))).toBe(true);
  });

  it('dedupes views to one per slug per day', () => {
    expect(store.logEvent('a', 'view', at(10, 9))).toBe(true);
    expect(store.logEvent('a', 'view', at(10, 18))).toBe(false);
    expect(store.logEvent('b', 'view', at(10, 18))).toBe(true);
    expect(store.logEvent('a', 'view', at(11, 9))).toBe(true);
    expect(store.getRecent(5)).toEqual(['a', 'b']);
  });

  it('counts a streak ending today or yesterday', () => {
    for (const d of [5, 7, 8, 9]) store.logEvent(`p${d}`, 'view', at(d));
    expect(store.getStreak(at(9))).toBe(3);
    expect(store.getStreak(at(10))).toBe(3);
    expect(store.getStreak(at(11))).toBe(0);
  });

  it('computes stats against the pages list', () => {
    store.setProgress('a', 'done');
    store.setProgress('b', 'in-progress');
    store.setProgress('gone', 'done');
    const stats = store.getStats([
      { slug: 'a', minutes: 30 },
      { slug: 'b', minutes: 45 },
      { slug: 'c' },
    ]);
    expect(stats).toEqual({ done: 1, inProgress: 1, total: 3, doneMinutes: 30 });
  });

  it('keeps progress separate per user', () => {
    store.setProgress('a', 'done');
    store.logEvent('a', 'view', at(10));
    const other = db.user('u2');
    expect(other.getAllProgress()).toEqual([]);
    expect(other.getStreak(at(10))).toBe(0);
    other.setProgress('a', 'in-progress');
    expect(store.getProgress('a')?.status).toBe('done');
  });
});

describe('single-user database migration', () => {
  function legacy(rows: number) {
    const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hatcher-legacy-'));
    const raw = new DatabaseSync(path.join(legacyDir, 'progress.db'));
    raw.exec("CREATE TABLE progress (slug TEXT PRIMARY KEY, status TEXT NOT NULL, notes TEXT, updated_at TEXT NOT NULL)");
    raw.exec("CREATE TABLE reading_log (id INTEGER PRIMARY KEY, slug TEXT NOT NULL, event TEXT NOT NULL, at TEXT NOT NULL)");
    for (let i = 0; i < rows; i++) raw.exec(`INSERT INTO progress VALUES ('s${i}', 'done', NULL, '2026-09-01')`);
    raw.close();
    return legacyDir;
  }
  const tables = (d: ProgressStore) =>
    (d.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map((r) => r.name);

  it('replaces empty single-user tables', () => {
    const d = openProgressStore(legacy(0));
    expect(tables(d)).toEqual(['progress', 'reading_log']);
    d.user('u').setProgress('a', 'done');
    d.close();
  });

  it('keeps non-empty single-user tables aside', () => {
    const d = openProgressStore(legacy(2));
    expect(tables(d)).toEqual(['progress', 'progress_single_user', 'reading_log']);
    expect(d.user('u').getAllProgress()).toEqual([]);
    d.close();
  });
});
