import { z } from 'zod';
import { badRequest, forbidden, notFound, readJson, tooManyRequests, unauthorized } from '@/lib/api';
import { siteURL, userByEmail, usersById } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { emailReady, sendMailInBackground, templates } from '@/lib/mail';
import { foreignOrigin } from '@/lib/origin';
import { allow } from '@/lib/rate-limit';
import { accessTo, canManage } from '@/lib/page-access';
import { getEmailSettings } from '@/lib/site-settings';
import { getViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

const MAX_SHARES = 200;

async function ownerOnly(request: Request | null, context: Context) {
  if (request) {
    const rejected = foreignOrigin(request);
    if (rejected) return { error: rejected } as const;
  }
  const viewer = await getViewer();
  if (!viewer) return { error: unauthorized() } as const;
  const db = getDb();
  const page = db.page((await context.params).id);
  const access = page ? accessTo(db, page, viewer.id) : null;
  if (!page || !access) return { error: notFound('no such page') } as const;
  if (!canManage(access)) return { error: forbidden('only the owner can share a page') } as const;
  return { viewer, db, page } as const;
}

function list(db: ReturnType<typeof getDb>, pageId: string) {
  const shares = db.shares(pageId);
  const users = usersById(shares.map((s) => s.user_id));
  return shares.map((s) => ({ userId: s.user_id, name: users.get(s.user_id)?.name ?? '', email: users.get(s.user_id)?.email ?? '(deleted)', access: s.access }));
}

export async function GET(_request: Request, context: Context) {
  const r = await ownerOnly(null, context);
  if ('error' in r) return r.error;
  return Response.json(list(r.db, r.page.id));
}

const shareBody = z.object({ email: z.string().trim().email().max(320), access: z.enum(['read', 'write']) });

/** Share with an existing account, or change that account's access. */
export async function POST(request: Request, context: Context) {
  const r = await ownerOnly(request, context);
  if ('error' in r) return r.error;
  // Sharing answers whether an account uses an email, so it must not become a lookup service.
  if (!allow(`share:${r.viewer.id}`, 30, 600_000)) return tooManyRequests('more than 30 shares in 10 minutes; try again later');
  const parsed = shareBody.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(parsed.error);
  const user = userByEmail(parsed.data.email);
  // The same answer for "no account" and "suspended account", so sharing cannot be used to tell them apart.
  if (!user || user.banned) return badRequest('No account uses that email. They need to register (or be invited by an admin) first.');
  if (user.id === r.viewer.id) return badRequest('You already own this page.');
  const existing = r.db.share(r.page.id, user.id);
  if (!existing && r.db.shares(r.page.id).length >= MAX_SHARES) return badRequest(`a page can be shared with at most ${MAX_SHARES} people`);
  r.db.putShare(r.page.id, user.id, parsed.data.access, r.viewer.id);
  r.db.audit({ userId: r.viewer.id, action: 'share', target: r.page.id, ok: true, detail: `${user.id}:${parsed.data.access}` });
  // At most one notice a day per page and person, however often it is unshared and shared again.
  if (!existing && emailReady() && getEmailSettings(r.db).shareNotices && allow(`notice:${r.page.id}:${user.id}`, 1, 24 * 3600_000)) {
    sendMailInBackground({
      to: user.email,
      ...templates.shared(r.viewer.name || r.viewer.email, r.page.title, parsed.data.access, `${siteURL(request)}/p/${r.page.id}`),
    });
  }
  return Response.json(list(r.db, r.page.id));
}

const unshareBody = z.object({ userId: z.string().min(1).max(200) });

export async function DELETE(request: Request, context: Context) {
  const r = await ownerOnly(request, context);
  if ('error' in r) return r.error;
  const parsed = unshareBody.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(parsed.error);
  r.db.deleteShare(r.page.id, parsed.data.userId);
  r.db.audit({ userId: r.viewer.id, action: 'unshare', target: r.page.id, ok: true, detail: parsed.data.userId });
  return Response.json(list(r.db, r.page.id));
}
