import { badRequest, readJson, unauthorized } from '@/lib/api';
import { createKey, createKeyBody, listKeys, MAX_KEYS_PER_USER } from '@/lib/api-keys';
import { foreignOrigin } from '@/lib/origin';
import { getViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

const FRESH_MS = 24 * 3600_000;

export async function GET() {
  if (!(await getViewer())) return unauthorized();
  return Response.json(await listKeys());
}

/** Create a key for the signed-in user. The secret is returned once and never stored in plain text. */
export async function POST(request: Request) {
  const rejected = foreignOrigin(request);
  if (rejected) return rejected;
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  // A key outlives the session, so making one needs a recent sign-in, not a stolen month-old cookie.
  if (Date.now() - new Date(viewer.sessionCreatedAt).getTime() > FRESH_MS) {
    return Response.json({ error: 'Sign in again to create an API key (your sign-in is over a day old).', code: 'reauthenticate' }, { status: 403 });
  }
  const parsed = createKeyBody.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(parsed.error);
  if ((await listKeys()).length >= MAX_KEYS_PER_USER) return badRequest(`at most ${MAX_KEYS_PER_USER} keys; revoke one first`);
  return Response.json(await createKey(viewer.id, parsed.data), { status: 201 });
}
