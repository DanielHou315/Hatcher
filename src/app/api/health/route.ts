import fs from 'node:fs';
import { contentDir, loadEntries } from '@/lib/content';
import { store } from '@/lib/db';
import { hatcherMode, isStudio } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export function GET() {
  try {
    const dir = contentDir();
    const entries = loadEntries(dir);
    if (isStudio()) store(); // the public site has no database
    return Response.json({
      ok: true,
      mode: hatcherMode(),
      contentDirExists: fs.existsSync(dir),
      entries: entries.length,
      invalid: entries.filter((e) => e.error).length,
    });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 503 });
  }
}
