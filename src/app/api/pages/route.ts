import { pageErrorResponse } from '@/lib/api';
import { create, listPages } from '@/lib/page-api';
import { PageError } from '@/lib/pages';
import { apiContext, readPageChange } from '@/lib/requester';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Pages the caller owns or that are shared with them, newest change first. `?q=` filters. */
export async function GET(request: Request) {
  const ctx = await apiContext(request);
  if (ctx instanceof Response) return ctx;
  try {
    return Response.json({ pages: listPages(ctx, new URL(request.url).searchParams.get('q') ?? undefined) });
  } catch (err) {
    return pageErrorResponse(err);
  }
}

/** Create a page: JSON `{ title, description?, note?, files: [{ path, text | base64 }] }`, or the browser's multipart form. */
export async function POST(request: Request) {
  const ctx = await apiContext(request);
  if (ctx instanceof Response) return ctx;
  try {
    const body = await readPageChange(request);
    if (body.title === undefined) throw new PageError('invalid', 'a page needs a title');
    return Response.json(create(ctx, { title: body.title, description: body.description, note: body.note, files: body.files }), { status: 201 });
  } catch (err) {
    return pageErrorResponse(err);
  }
}
