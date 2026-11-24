import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

// Hatcher's own database, DATA_DIR/hatcher.db: pages, their versions, shares, site settings and the
// audit log. Accounts, sessions, 2FA and API keys live in Better Auth's DATA_DIR/auth.db.

// Loaded at runtime so the bundler never sees a static import of node:sqlite.
export function sqlite(): typeof import('node:sqlite') {
  return process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
}

export function dataDir(): string {
  return path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
}

export type Access = 'read' | 'write';
export const ACCESS: readonly Access[] = ['read', 'write'];

export interface PageRow {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface VersionRow {
  page_id: string;
  version: number;
  author_id: string;
  key_id: string | null;
  note: string | null;
  files: number;
  /** Size of the whole version. */
  bytes: number;
  /** Bytes this version added on disk: files unchanged from the previous version are shared, not copied. */
  stored_bytes: number;
  created_at: string;
}

/** What a user's pages take up, counted against their quota. */
export interface Usage {
  pages: number;
  bytes: number;
}

export interface ShareRow {
  page_id: string;
  user_id: string;
  access: Access;
  created_at: string;
  created_by: string;
}

/** A page as one user sees it, with that user's access. */
export interface ListedPage extends PageRow {
  access: 'owner' | Access;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pages_owner ON pages (owner_id, updated_at);
CREATE TABLE IF NOT EXISTS page_versions (
  page_id TEXT NOT NULL REFERENCES pages (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  author_id TEXT NOT NULL,
  key_id TEXT,
  note TEXT,
  files INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  stored_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (page_id, version)
);
CREATE TABLE IF NOT EXISTS shares (
  page_id TEXT NOT NULL REFERENCES pages (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  access TEXT NOT NULL CHECK (access IN ('read', 'write')),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  PRIMARY KEY (page_id, user_id)
);
CREATE INDEX IF NOT EXISTS shares_user ON shares (user_id);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
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

export interface AuditRecord {
  userId: string;
  keyId?: string | null;
  action: string;
  target?: string;
  ok: boolean;
  detail?: string;
}

export function openDb(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  const db: DatabaseSync = new (sqlite().DatabaseSync)(path.join(dir, 'hatcher.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  // 0.3: versions record the bytes they added. Older versions were full copies.
  const versionCols = (db.prepare('PRAGMA table_info(page_versions)').all() as { name: string }[]).map((c) => c.name);
  if (!versionCols.includes('stored_bytes')) {
    db.exec('ALTER TABLE page_versions ADD COLUMN stored_bytes INTEGER NOT NULL DEFAULT 0; UPDATE page_versions SET stored_bytes = bytes;');
  }

  const q = {
    page: db.prepare('SELECT * FROM pages WHERE id = ?'),
    insertPage: db.prepare(
      'INSERT INTO pages (id, owner_id, title, description, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ),
    setVersion: db.prepare('UPDATE pages SET version = ?, updated_at = ? WHERE id = ? AND version = ?'),
    setDetails: db.prepare('UPDATE pages SET title = ?, description = ?, updated_at = ? WHERE id = ?'),
    deletePage: db.prepare('DELETE FROM pages WHERE id = ?'),
    pagesOf: db.prepare('SELECT id FROM pages WHERE owner_id = ?'),
    insertVersion: db.prepare(
      'INSERT INTO page_versions (page_id, version, author_id, key_id, note, files, bytes, stored_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ),
    usage: db.prepare(
      `SELECT COUNT(DISTINCT p.id) AS pages, COALESCE(SUM(v.stored_bytes), 0) AS bytes
       FROM pages p LEFT JOIN page_versions v ON v.page_id = p.id WHERE p.owner_id = ?`,
    ),
    usageAll: db.prepare(
      `SELECT p.owner_id AS user_id, COUNT(DISTINCT p.id) AS pages, COALESCE(SUM(v.stored_bytes), 0) AS bytes
       FROM pages p LEFT JOIN page_versions v ON v.page_id = p.id GROUP BY p.owner_id`,
    ),
    versions: db.prepare('SELECT * FROM page_versions WHERE page_id = ? ORDER BY version DESC'),
    share: db.prepare('SELECT * FROM shares WHERE page_id = ? AND user_id = ?'),
    shares: db.prepare('SELECT * FROM shares WHERE page_id = ? ORDER BY created_at'),
    upsertShare: db.prepare(
      `INSERT INTO shares (page_id, user_id, access, created_at, created_by) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (page_id, user_id) DO UPDATE SET access = excluded.access`,
    ),
    deleteShare: db.prepare('DELETE FROM shares WHERE page_id = ? AND user_id = ?'),
    deleteSharesOf: db.prepare('DELETE FROM shares WHERE user_id = ?'),
    visible: db.prepare(
      `SELECT p.*, 'owner' AS access FROM pages p WHERE p.owner_id = ?1
       UNION ALL
       SELECT p.*, s.access AS access FROM pages p JOIN shares s ON s.page_id = p.id WHERE s.user_id = ?1 AND p.owner_id <> ?1
       ORDER BY updated_at DESC`,
    ),
    setting: db.prepare('SELECT value FROM settings WHERE key = ?'),
    putSetting: db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'),
    audit: db.prepare('INSERT INTO audit_log (at, user_id, key_id, action, target, ok, detail) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  };

  const tx = <T>(fn: () => T): T => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  return {
    db,
    tx,
    page: (id: string) => q.page.get(id) as unknown as PageRow | undefined,
    insertPage: (p: PageRow) => q.insertPage.run(p.id, p.owner_id, p.title, p.description, p.version, p.created_at, p.updated_at),
    /** Move a page to `next` only if it is still at `current`. Returns false when someone else got there first. */
    advanceVersion: (id: string, current: number, next: number, at: string) => q.setVersion.run(next, at, id, current).changes === 1,
    setDetails: (id: string, title: string, description: string, at: string) => q.setDetails.run(title, description, at, id),
    deletePage: (id: string) => q.deletePage.run(id),
    pageIdsOwnedBy: (userId: string) => (q.pagesOf.all(userId) as { id: string }[]).map((r) => r.id),
    insertVersion: (v: VersionRow) =>
      q.insertVersion.run(v.page_id, v.version, v.author_id, v.key_id, v.note, v.files, v.bytes, v.stored_bytes, v.created_at),
    usage: (userId: string): Usage => {
      const r = q.usage.get(userId) as { pages: number; bytes: number };
      return { pages: Number(r.pages), bytes: Number(r.bytes) };
    },
    /** Usage of every user who owns a page, by user id. */
    usageByUser: (): Map<string, Usage> =>
      new Map(
        (q.usageAll.all() as { user_id: string; pages: number; bytes: number }[]).map((r) => [r.user_id, { pages: Number(r.pages), bytes: Number(r.bytes) }]),
      ),
    versions: (id: string) => q.versions.all(id) as unknown as VersionRow[],
    share: (pageId: string, userId: string) => q.share.get(pageId, userId) as unknown as ShareRow | undefined,
    shares: (pageId: string) => q.shares.all(pageId) as unknown as ShareRow[],
    putShare: (pageId: string, userId: string, access: Access, by: string) =>
      q.upsertShare.run(pageId, userId, access, new Date().toISOString(), by),
    deleteShare: (pageId: string, userId: string) => q.deleteShare.run(pageId, userId).changes === 1,
    deleteSharesOf: (userId: string) => q.deleteSharesOf.run(userId),
    /** Pages a user owns or that are shared with them, most recently updated first. */
    visiblePages: (userId: string) => q.visible.all(userId) as unknown as ListedPage[],
    getSetting: (key: string) => (q.setting.get(key) as { value: string } | undefined)?.value,
    putSetting: (key: string, value: string) => q.putSetting.run(key, value),
    audit: (r: AuditRecord) =>
      q.audit.run(new Date().toISOString(), r.userId, r.keyId ?? null, r.action, r.target ?? null, r.ok ? 1 : 0, r.detail?.slice(0, 2000) ?? null),
    close: () => db.close(),
  };
}

export type Db = ReturnType<typeof openDb>;

const g = globalThis as unknown as { __hatcherDb?: { dir: string; db: Db } };

/** The process-wide database for DATA_DIR. */
export function getDb(): Db {
  const dir = dataDir();
  if (!g.__hatcherDb || g.__hatcherDb.dir !== dir) g.__hatcherDb = { dir, db: openDb(dir) };
  return g.__hatcherDb.db;
}
