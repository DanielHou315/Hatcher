import { getMigrations } from 'better-auth/db/migration';
import { getAuth } from './auth';
import { dataDir, getDb } from './db';
import { cleanStaging } from './pages';
import { authSettings } from './settings';

/** Create or update the databases and clear leftovers of interrupted writes. Runs once at server start. */
export async function startup() {
  if (!authSettings().baseURL && process.env.NODE_ENV === 'production') {
    // Without it, the site's address is taken from the request, which inside a container is the
    // container's own (http://0.0.0.0:3000), and every sign-in is refused as "Invalid origin".
    console.error('[hatcher] BETTER_AUTH_URL is not set: sign-in will fail. Set it to the URL people open, e.g. https://hatcher.example.com');
  }
  getDb();
  cleanStaging(dataDir());
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(getAuth().options);
  if (toBeCreated.length === 0 && toBeAdded.length === 0) return;
  await runMigrations();
  const tables = [...toBeCreated, ...toBeAdded].map((t) => t.table);
  console.log(`[auth] migrated tables: ${[...new Set(tables)].join(', ')}`);
}
