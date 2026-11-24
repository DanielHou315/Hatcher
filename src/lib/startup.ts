import { getMigrations } from 'better-auth/db/migration';
import { getAuth } from './auth';
import { dataDir, getDb } from './db';
import { cleanStaging } from './pages';

/** Create or update the databases and clear leftovers of interrupted writes. Runs once at server start. */
export async function startup() {
  getDb();
  cleanStaging(dataDir());
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(getAuth().options);
  if (toBeCreated.length === 0 && toBeAdded.length === 0) return;
  await runMigrations();
  const tables = [...toBeCreated, ...toBeAdded].map((t) => t.table);
  console.log(`[auth] migrated tables: ${[...new Set(tables)].join(', ')}`);
}
