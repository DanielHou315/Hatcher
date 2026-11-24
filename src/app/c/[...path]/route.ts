import fs from 'node:fs';
import path from 'node:path';
import { verifyContentToken } from '@/lib/content-token';
import { dataDir, getDb } from '@/lib/db';
import { isPageId, resolvePageFile } from '@/lib/pages';
import { contentHeaders } from '@/lib/sandbox';
import { authSettings } from '@/lib/settings';
import { getCdnHosts } from '@/lib/site-settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ path: string[] }> };

/**
 * Page content: /c/~<token>/<page id>/<version>/<file path>. Every response carries the sandbox
 * policy. The token is signed by the viewer page after it checked the reader's access, since
 * sandboxed frames cannot send the session cookie.
 */
export async function GET(_request: Request, { params }: Context) {
  const cdn = getCdnHosts(getDb());
  const notFound = () => new Response('Not found', { status: 404, headers: contentHeaders('.txt', cdn) });
  const [tokenPart, id, versionPart, ...rest] = (await params).path.map((s) => decodeURIComponent(s));
  if (!tokenPart?.startsWith('~') || !id || !isPageId(id) || !versionPart || !/^\d{1,9}$/.test(versionPart)) return notFound();
  if (!verifyContentToken(authSettings().secret, id, tokenPart.slice(1))) return notFound();
  const page = getDb().page(id);
  const version = Number(versionPart);
  if (!page || version > page.version) return notFound();

  const filePath = rest.length ? rest.join('/') : 'index.html';
  const file = resolvePageFile(dataDir(), id, version, filePath);
  if (!file) return notFound();
  return new Response(fs.readFileSync(file), { headers: contentHeaders(path.extname(file).toLowerCase(), cdn, filePath === 'index.html') });
}
