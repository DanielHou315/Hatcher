import { badRequest, progressBody, readJson, unauthorized } from '@/lib/api';
import { userProgress } from '@/lib/db';
import { foreignOrigin } from '@/lib/origin';
import { getViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  return Response.json(userProgress(viewer.id).getAllProgress());
}

export async function POST(request: Request) {
  const rejected = foreignOrigin(request);
  if (rejected) return rejected;
  const viewer = await getViewer();
  if (!viewer) return unauthorized();
  const parsed = progressBody.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(parsed.error);
  const { slug, status, notes } = parsed.data;
  return Response.json(userProgress(viewer.id).setProgress(slug, status, notes));
}
