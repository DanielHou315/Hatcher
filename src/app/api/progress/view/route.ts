import { badRequest, readJson, unauthorized, viewBody } from '@/lib/api';
import { userProgress } from '@/lib/db';
import { foreignOrigin } from '@/lib/origin';
import { getViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const rejected = foreignOrigin(request);
  if (rejected) return rejected;
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  const parsed = viewBody.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(parsed.error);
  const logged = userProgress(viewer.id).logEvent(parsed.data.slug, 'view');
  return Response.json({ slug: parsed.data.slug, logged });
}
