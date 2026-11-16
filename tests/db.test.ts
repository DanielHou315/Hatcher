import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openProgressStore, type ProgressStore } from '@/lib/db';

let dir: string;
let store: ProgressStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hatcher-db-'));
  store = openProgressStore(dir);
});

afterEach(() => {
  store.close();
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
});
