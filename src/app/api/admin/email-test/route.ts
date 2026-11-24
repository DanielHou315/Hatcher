import { z } from 'zod';
import { badRequest, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/admin-guard';
import { getDb } from '@/lib/db';
import { sendMail, templates } from '@/lib/mail';
import { authSettings } from '@/lib/settings';
import { emailSchema, getEmailPassword, getEmailSettings } from '@/lib/site-settings';

/** A short reason that helps fix the settings without echoing what the remote server said. */
function smtpError(err: unknown): string {
  const e = err as { code?: string; responseCode?: number };
  if (e.code === 'EAUTH') return 'The server refused the user name or password.';
  if (e.code === 'ETIMEDOUT' || e.code === 'ESOCKET' || e.code === 'ECONNECTION') return 'Could not connect: check the host, port and security.';
  if (e.code === 'EENVELOPE') return 'The server refused the sender or recipient: check the From address.';
  return `Sending failed${e.code ? ` (${e.code})` : ''}; the audit log has details.`;
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const body = z.object({ settings: emailSchema, password: z.string().max(1000).optional() });

/** Send a test email to the admin with the settings in the form (saved or not), and report the SMTP error if any. */
export async function POST(request: Request) {
  const r = await requireAdmin(request);
  if ('error' in r) return r.error;
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(parsed.error);
  const db = getDb();
  const form = parsed.data.settings;
  const saved = getEmailSettings(db);
  // The stored password goes only to the server it was saved for, never to a host typed into the form.
  const sameServer = form.host === saved.host && form.port === saved.port && form.user === saved.user;
  if (parsed.data.password === undefined && !sameServer && saved.hasPassword) {
    return badRequest('Enter the password again to test a different server.');
  }
  const password = parsed.data.password ?? (sameServer ? getEmailPassword(db, authSettings().secret) : '');
  try {
    await sendMail({ to: r.admin.email, ...templates.test() }, { settings: form, password });
    db.audit({ userId: r.admin.id, action: 'email_test', ok: true, detail: `${form.host}:${form.port}` });
    return Response.json({ ok: true, to: r.admin.email });
  } catch (err) {
    db.audit({ userId: r.admin.id, action: 'email_test', ok: false, detail: `${form.host}:${form.port} ${(err as Error).message}` });
    return Response.json({ ok: false, error: smtpError(err) }, { status: 502 });
  }
}
