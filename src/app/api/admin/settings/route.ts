import { z } from 'zod';
import { badRequest, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/admin-guard';
import { resetAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { emailReady } from '@/lib/mail';
import { parseCdnHosts } from '@/lib/sandbox';
import { authSettings } from '@/lib/settings';
import {
  emailSchema,
  getCdnHosts,
  getEmailSettings,
  getQuota,
  getRegistration,
  quotaSchema,
  registrationSchema,
  setCdnHosts,
  setEmailSettings,
  setQuota,
  setRegistration,
} from '@/lib/site-settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function current() {
  const db = getDb();
  const email = getEmailSettings(db);
  return { registration: getRegistration(db), email, emailReady: emailReady(email), cdnHosts: getCdnHosts(db), quota: getQuota(db) };
}

export async function GET() {
  const r = await requireAdmin(null);
  if ('error' in r) return r.error;
  return Response.json(current());
}

const body = z.object({
  registration: registrationSchema.optional(),
  email: emailSchema.extend({ password: z.string().max(1000).optional() }).optional(),
  cdnHosts: z.string().max(10_000).optional(),
  quota: quotaSchema.optional(),
});

/** Save any of the sections. Each is validated whole; nothing is saved if one is invalid. */
export async function PUT(request: Request) {
  const r = await requireAdmin(request);
  if ('error' in r) return r.error;
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(parsed.error);
  const db = getDb();
  const { registration, email, cdnHosts, quota } = parsed.data;

  let hosts: string[] | undefined;
  if (cdnHosts !== undefined) {
    const { hosts: valid, invalid } = parseCdnHosts(cdnHosts);
    if (invalid.length) return badRequest(`not a host name: ${invalid.join(', ')} (enter names like cdn.jsdelivr.net, without https:// or paths)`);
    hosts = valid;
  }
  const emailAfter = email ?? getEmailSettings(db);
  const regAfter = registration ?? getRegistration(db);
  if (registration?.requireVerification && !emailReady(emailAfter)) {
    return badRequest('Turn on email first: confirming addresses needs it.');
  }
  // Anyone can type an address at an allowed domain; only a confirmed one proves they have it.
  if (registration?.mode === 'domains' && !registration.requireVerification) {
    return badRequest('Registration by domain needs new accounts to confirm their email; tick that too.');
  }
  if (regAfter.requireVerification && regAfter.mode !== 'closed' && !emailReady(emailAfter)) {
    return badRequest('Registration needs email to confirm new accounts: close registration before turning email off.');
  }

  if (email) {
    const { password, ...settings } = email;
    const saved = getEmailSettings(db);
    // A stored password belongs to its server: pointing the settings elsewhere drops it.
    const moved = settings.host !== saved.host || settings.port !== saved.port || settings.user !== saved.user;
    setEmailSettings(db, settings, password ?? (moved ? '' : undefined), authSettings().secret);
  }
  if (registration) setRegistration(db, registration);
  if (hosts) setCdnHosts(db, hosts);
  // Better Auth reads whether to require verification when it is built.
  if (registration || email) resetAuth();
  if (quota) setQuota(db, quota);
  db.audit({ userId: r.admin.id, action: 'settings', ok: true, detail: Object.keys(parsed.data).join(',') });
  return Response.json(current());
}
