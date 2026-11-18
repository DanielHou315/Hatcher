import fs from 'node:fs';
import { contentDir, loadEntries } from '@/lib/content';
import { verifyContentToken } from '@/lib/content-token';
import { contentHeaders, prepareHtml, resolveContentPath } from '@/lib/sandbox';
import { authSettings, isStudio } from '@/lib/settings';
import { KIND_DIRS } from '@/lib/kinds';
import { isPublicContent } from '@/lib/viewer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ path: string[] }> };

const notFound = () => new Response('Not found', { status: 404, headers: contentHeaders('.txt') });

/**
 * Sandboxed page code: HTML pages, figures and their assets. Every response carries the sandbox
 * policy. The public site serves published pages only. The studio needs the signed token the
 * page embedded in the frame URL (`/c/~<token>/...`), since frames cannot send the session cookie.
 */
export async function GET(_request: Request, { params }: Context) {
  let segments = (await params).path;
  let token: string | undefined;
  if (segments[0]?.startsWith('~')) {
    token = segments[0].slice(1);
    segments = segments.slice(1);
  }
  const dir = contentDir();
  const hit = resolveContentPath(dir, segments);
  if (!hit) return notFound();

  const [kindDir, slug] = segments;
  const entry = loadEntries(dir).find((e) => KIND_DIRS[e.kind] === kindDir && e.slug === slug);
  const open = entry ? isPublicContent(entry) : false;
  // The public site has no tokens at all; the studio frames everything through one.
  if (!open && !(isStudio() && token && verifyContentToken(authSettings().secret, `${kindDir}/${slug}`, token))) return notFound();

  const headers = contentHeaders(hit.ext);
  if (hit.ext === '.html') {
    const html = prepareHtml(fs.readFileSync(hit.file, 'utf8'), { stripFrontmatter: hit.entryDoc });
    return new Response(html, { headers });
  }
  return new Response(fs.readFileSync(hit.file), { headers });
}
