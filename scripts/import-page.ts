// Import an HTML page from disk as a new page owned by an existing account.
//
//   npm run import-page -- --owner you@example.com --title "Title" [--description "..."] <folder | file.html>
//
// A folder must hold index.html; every servable file in it is imported. Frontmatter at the top of
// an HTML file (from Hatcher 0.1) is dropped. Uses DATA_DIR like the server; safe to run while it runs.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { dataDir, openDb, sqlite } from '../src/lib/db';
import { createPage, type FileWrite } from '../src/lib/pages';
import { CONTENT_TYPES } from '../src/lib/sandbox';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { owner: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' } },
});
const source = positionals[0];
if (!values.owner || !values.title || !source) {
  console.error('usage: npm run import-page -- --owner <email> --title <title> [--description <text>] <folder | file.html>');
  process.exit(2);
}

const dir = dataDir();
const auth = new (sqlite().DatabaseSync)(path.join(dir, 'auth.db'), { readOnly: true });
const owner = auth.prepare('SELECT id FROM user WHERE lower(email) = ?').get(values.owner.toLowerCase()) as { id: string } | undefined;
if (!owner) {
  console.error(`no account with email ${values.owner}`);
  process.exit(1);
}

const FRONTMATTER = /^﻿?---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
const files: FileWrite[] = [];
const stat = fs.statSync(source);
if (stat.isDirectory()) {
  for (const d of fs.readdirSync(source, { recursive: true, withFileTypes: true })) {
    if (!d.isFile()) continue;
    const abs = path.join(d.parentPath, d.name);
    const rel = path.relative(source, abs).split(path.sep).join('/');
    if (rel.split('/').some((s) => s.startsWith('.')) || !CONTENT_TYPES[path.extname(rel).toLowerCase()]) {
      console.warn(`skipping ${rel}`);
      continue;
    }
    files.push({ path: rel, data: fs.readFileSync(abs) });
  }
} else {
  files.push({ path: 'index.html', data: fs.readFileSync(source) });
}
for (const f of files) {
  if (f.path === 'index.html') f.data = Buffer.from(f.data.toString('utf8').replace(FRONTMATTER, ''), 'utf8');
}

const db = openDb(dir);
const page = createPage(db, dir, { userId: owner.id }, { title: values.title, description: values.description, files, note: `Imported from ${path.basename(source)}` });
db.audit({ userId: owner.id, action: 'import_page', target: page.id, ok: true, detail: source });
console.log(`imported ${files.length} file(s) as page ${page.id}: /p/${page.id}`);
