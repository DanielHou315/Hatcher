import { getMigrations } from 'better-auth/db/migration';
import { getAuth } from './auth';

/** Create or update Better Auth's tables in DATA_DIR/auth.db. Runs once at server start. */
export async function migrateAuth() {
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(getAuth().options);
  if (toBeCreated.length === 0 && toBeAdded.length === 0) return;
  await runMigrations();
  const tables = [...toBeCreated, ...toBeAdded].map((t) => t.table);
  console.log(`[auth] migrated tables: ${[...new Set(tables)].join(', ')}`);
}
