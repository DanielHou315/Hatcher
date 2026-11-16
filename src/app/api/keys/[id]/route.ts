import { unauthorized } from '@/lib/api';
import { deleteKey } from '@/lib/api-keys';
import { foreignOrigin } from '@/lib/origin';
import { getViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** Revoke one of the signed-in user's keys (Better Auth checks ownership). */
export async function DELETE(request: Request, { params }: Context) {
  const rejected = foreignOrigin(request);
  if (rejected) return rejected;
  if (!(await getViewer())) return unauthorized();
  try {
    return Response.json(await deleteKey((await params).id));
  } catch {
    return Response.json({ error: 'key not found' }, { status: 404 });
  }
}
