import fs from 'node:fs';
import path from 'node:path';
import { userIsActive } from '@/lib/auth';
import { verifyContentToken } from '@/lib/content-token';
import { dataDir, getDb } from '@/lib/db';
import { accessTo } from '@/lib/page-access';
import { isPageId, resolvePageFile } from '@/lib/pages';
import { contentHeaders, contentOrigin } from '@/lib/sandbox';
import { authSettings } from '@/lib/settings';
import { getCdnHosts } from '@/lib/site-settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ path: string[] }> };

/**
 * Page content: /c/~<token>/<page id>/<version>/<file path>. Every response carries the sandbox
 * policy. The token, signed by the viewer page, names the reader; their access is checked again here.
 */
export async function GET(request: Request, { params }: Context) {
  const cdn = getCdnHosts(getDb());
  const refuse = (status: number, text: string) => new Response(text, { status, headers: contentHeaders('.txt', cdn) });
  const notFound = () => refuse(404, 'Not found');

  const content = contentOrigin();
  if (content) {
    // With a separate content origin, page content is served there and nowhere else.
    if (request.headers.get('host') !== new URL(content).host) return notFound();
  } else if (request.headers.get('sec-fetch-dest') === 'document') {
    // On the site's own address, a page opened by itself could pose as Hatcher (say, a fake
    // sign-in form). It is only shown inside the viewer's frame.
    return refuse(403, 'Open this page from Hatcher. To open pages in their own tab, the site needs CONTENT_ORIGIN.');
  }

  // Route parameters arrive decoded already.
  const [tokenPart, id, versionPart, ...rest] = (await params).path;
  if (!tokenPart?.startsWith('~') || !id || !isPageId(id) || !versionPart || !/^\d{1,9}$/.test(versionPart)) return notFound();
  const version = Number(versionPart);
  const userId = verifyContentToken(authSettings().secret, id, version, tokenPart.slice(1));
  if (!userId) return notFound();
  const db = getDb();
  const page = db.page(id);
  if (!page || version > page.version || !accessTo(db, page, userId) || !userIsActive(userId)) return notFound();

  const filePath = rest.length ? rest.join('/') : 'index.html';
  const file = resolvePageFile(dataDir(), id, version, filePath);
  if (!file) return notFound();
  return new Response(fs.readFileSync(file), { headers: contentHeaders(path.extname(file).toLowerCase(), cdn, filePath === 'index.html') });
}
