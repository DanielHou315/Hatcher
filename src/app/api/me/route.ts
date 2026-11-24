import { usersById } from '@/lib/auth';
import { usageOf } from '@/lib/page-api';
import { apiContext } from '@/lib/requester';
import pkg from '../../../../package.json';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Who the caller is and what they may do: for clients to check their key and server. */
export async function GET(request: Request) {
  const ctx = await apiContext(request);
  if (ctx instanceof Response) return ctx;
  const user = usersById([ctx.who.userId]).get(ctx.who.userId);
  return Response.json({
    user: user ? { id: user.id, name: user.name, email: user.email } : { id: ctx.who.userId },
    via: ctx.who.keyId ? 'api-key' : 'session',
    actions: ctx.who.actions,
    usage: usageOf(ctx),
    server: { name: 'hatcher', version: pkg.version, url: ctx.baseURL },
  });
}
