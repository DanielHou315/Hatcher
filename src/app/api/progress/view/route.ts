import { foreignOrigin } from '@/lib/origin';
import { badRequest, readJson, viewBody } from '@/lib/api';
import { logEvent } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const rejected = foreignOrigin(request);
  if (rejected) return rejected;
  const parsed = viewBody.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(parsed.error);
  const logged = logEvent(parsed.data.slug, 'view');
  return Response.json({ slug: parsed.data.slug, logged });
}
