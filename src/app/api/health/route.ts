import fs from 'node:fs';
import { contentDir, loadEntries } from '@/lib/content';
import { getAllProgress } from '@/lib/db';

export const dynamic = 'force-dynamic';

export function GET() {
  try {
    const dir = contentDir();
    const entries = loadEntries(dir);
    getAllProgress();
    return Response.json({
      ok: true,
      contentDir: dir,
      contentDirExists: fs.existsSync(dir),
      entries: entries.length,
      invalid: entries.filter((e) => e.error).length,
    });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 503 });
  }
}
