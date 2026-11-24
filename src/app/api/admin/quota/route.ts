import { z } from 'zod';
import { badRequest, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/admin-guard';
import { getDb } from '@/lib/db';
import { getQuota, limitFor, setQuota } from '@/lib/site-settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Each user's usage and limit, by user id (users without pages are absent and use the default). */
function current() {
  const db = getDb();
  const quota = getQuota(db);
  const usage = db.usageByUser();
  const ids = new Set([...usage.keys(), ...Object.keys(quota.users)]);
  return {
    default: quota.default,
    users: Object.fromEntries(
      [...ids].map((id) => [id, { ...(usage.get(id) ?? { pages: 0, bytes: 0 }), limit: limitFor(quota, id) }]),
    ),
  };
}

export async function GET() {
  const r = await requireAdmin(null);
  if ('error' in r) return r.error;
  return Response.json(current());
}

const body = z.object({
  userId: z.string().min(1).max(64),
  /** The user's own limit, or null to go back to the default. */
  limit: z.object({ storageMB: z.number().int().min(0).max(10_000_000), pages: z.number().int().min(0).max(1_000_000) }).nullable(),
});

/** Give one user their own limit, or put them back on the default. */
export async function PUT(request: Request) {
  const r = await requireAdmin(request);
  if ('error' in r) return r.error;
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(parsed.error);
  const db = getDb();
  const quota = getQuota(db);
  const users = { ...quota.users };
  if (parsed.data.limit) users[parsed.data.userId] = parsed.data.limit;
  else delete users[parsed.data.userId];
  setQuota(db, { ...quota, users });
  db.audit({
    userId: r.admin.id,
    action: 'quota',
    target: parsed.data.userId,
    ok: true,
    detail: parsed.data.limit ? `${parsed.data.limit.storageMB} MB, ${parsed.data.limit.pages} pages` : 'default',
  });
  return Response.json(current());
}
