import { badRequest, readJson, unauthorized } from '@/lib/api';
import { createKey, createKeyBody, listKeys, MAX_KEYS_PER_USER } from '@/lib/api-keys';
import { foreignOrigin } from '@/lib/origin';
import { getViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

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
  const parsed = createKeyBody.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(parsed.error);
  if ((await listKeys()).length >= MAX_KEYS_PER_USER) return badRequest(`at most ${MAX_KEYS_PER_USER} keys; revoke one first`);
  return Response.json(await createKey(viewer.id, parsed.data), { status: 201 });
}
