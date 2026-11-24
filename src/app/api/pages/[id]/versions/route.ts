import { pageErrorResponse } from '@/lib/api';
import { listVersions, update } from '@/lib/page-api';
import { PageError } from '@/lib/pages';
import { apiContext, readPageChange } from '@/lib/requester';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

/** Every saved version, newest first. */
export async function GET(request: Request, { params }: Context) {
  const ctx = await apiContext(request);
  if (ctx instanceof Response) return ctx;
  try {
    return Response.json({ versions: listVersions(ctx, (await params).id) });
  } catch (err) {
    return pageErrorResponse(err);
  }
}

/** Save a new version: `{ expectedVersion, files?, delete?, note? }` as JSON, or the browser's multipart form. */
export async function POST(request: Request, { params }: Context) {
  const ctx = await apiContext(request);
  if (ctx instanceof Response) return ctx;
  try {
    const body = await readPageChange(request);
    if (body.expectedVersion === undefined || !Number.isInteger(body.expectedVersion)) {
      throw new PageError('invalid', 'expectedVersion is required: the version your change is based on');
    }
    const result = update(ctx, (await params).id, { expectedVersion: body.expectedVersion, files: body.files, delete: body.delete, note: body.note });
    return Response.json(result, { status: 201 });
  } catch (err) {
    return pageErrorResponse(err);
  }
}
