import fs from 'node:fs';
import path from 'node:path';
import { guideHeader } from '@/lib/page-api';
import { apiContext } from '@/lib/requester';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let guide: string | undefined;

/** How to write pages (docs/pages.md), with what this caller may do and load. Markdown. */
export async function GET(request: Request) {
  const ctx = await apiContext(request);
  if (ctx instanceof Response) return ctx;
  guide ??= fs.readFileSync(path.join(process.cwd(), 'docs/pages.md'), 'utf8');
  return new Response(`${guideHeader(ctx)}\n\n---\n\n${guide}`, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
}
