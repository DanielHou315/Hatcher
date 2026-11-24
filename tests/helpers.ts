import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, type Db } from '@/lib/db';

export interface Env {
  dir: string;
  db: Db;
  cleanup: () => void;
}

/** A fresh data directory with its database. */
export function tempEnv(): Env {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hatcher-test-'));
  const db = openDb(dir);
  return {
    dir,
    db,
    cleanup: () => {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const html = (body: string) => `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;
export const file = (p: string, text: string) => ({ path: p, data: Buffer.from(text) });
