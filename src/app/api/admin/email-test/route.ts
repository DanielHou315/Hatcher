import { z } from 'zod';
import { badRequest, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/admin-guard';
import { getDb } from '@/lib/db';
import { sendMail, templates } from '@/lib/mail';
import { authSettings } from '@/lib/settings';
import { emailSchema, getEmailPassword } from '@/lib/site-settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const body = z.object({ settings: emailSchema, password: z.string().max(1000).optional() });

/** Send a test email to the admin with the settings in the form (saved or not), and report the SMTP error if any. */
export async function POST(request: Request) {
  const r = await requireAdmin(request);
  if ('error' in r) return r.error;
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(parsed.error);
  const password = parsed.data.password ?? getEmailPassword(getDb(), authSettings().secret);
  try {
    await sendMail({ to: r.admin.email, ...templates.test() }, { settings: parsed.data.settings, password });
    return Response.json({ ok: true, to: r.admin.email });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 502 });
  }
}
