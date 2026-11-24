import { pageErrorResponse } from '@/lib/api';
import { readFile } from '@/lib/page-api';
import { apiContext, versionParam } from '@/lib/requester';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string; path: string[] }> };

/**
 * One file of a page as JSON: `text` for text files, `base64` otherwise. Never served raw here:
 * page code runs only from the sandboxed content route.
 */
export async function GET(request: Request, { params }: Context) {
  const ctx = await apiContext(request);
  if (ctx instanceof Response) return ctx;
  try {
    const { id, path } = await params;
    return Response.json(readFile(ctx, id, path.map(decodeURIComponent).join('/'), versionParam(request)));
  } catch (err) {
    return pageErrorResponse(err);
  }
}
