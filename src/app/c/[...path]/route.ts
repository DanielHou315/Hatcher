import fs from 'node:fs';
import { contentDir } from '@/lib/content';
import { contentHeaders, prepareHtml, resolveContentPath } from '@/lib/sandbox';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ path: string[] }> };

/** Sandboxed page code: HTML pages, figures and their assets. Every response carries the sandbox policy. */
export async function GET(_request: Request, { params }: Context) {
  const hit = resolveContentPath(contentDir(), (await params).path);
  if (!hit) return new Response('Not found', { status: 404, headers: contentHeaders('.txt') });
  const headers = contentHeaders(hit.ext);
  if (hit.ext === '.html') {
    const html = prepareHtml(fs.readFileSync(hit.file, 'utf8'), { stripFrontmatter: hit.entryDoc });
    return new Response(html, { headers });
  }
  return new Response(fs.readFileSync(hit.file), { headers });
}
