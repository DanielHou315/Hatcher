import { badRequest, progressBody, readJson } from '@/lib/api';
import { getAllProgress, setProgress } from '@/lib/db';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(getAllProgress());
}

export async function POST(request: Request) {
  const parsed = progressBody.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(parsed.error);
  const { slug, status, notes } = parsed.data;
  return Response.json(setProgress(slug, status, notes));
}
