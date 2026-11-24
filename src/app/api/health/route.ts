import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Liveness for Docker: the database opens and answers. Says nothing about accounts or pages. */
export function GET() {
  try {
    getDb().db.prepare('SELECT 1').get();
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 503 });
  }
}
