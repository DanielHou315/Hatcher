import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '@/lib/auth';
import { BodyTooLarge, withCappedBody } from '@/lib/body';

export const dynamic = 'force-dynamic';

/** Sign-in, sign-up, 2FA and the rest take small JSON bodies; nothing larger is read. */
const MAX_BODY = 64 * 1024;

export async function GET(request: Request) {
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request) {
  let capped: Request;
  try {
    capped = await withCappedBody(request, MAX_BODY);
  } catch (err) {
    if (err instanceof BodyTooLarge) return Response.json({ error: 'request body too large' }, { status: 413 });
    return Response.json({ error: 'could not read the request' }, { status: 400 });
  }
  return toNextJsHandler(getAuth()).POST(capped);
}
