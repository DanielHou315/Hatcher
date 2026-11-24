import 'server-only';
import { BodyTooLarge, withCappedBody } from './body';
import { LIMITS, MAIN_FILE, PageError, type FileWrite } from './pages';

const MB = 1024 * 1024;

/** Requests from the browser forms: files arrive as multipart parts named "files" (filename = path inside the page). */
export async function readUpload(request: Request): Promise<{ form: FormData; files: FileWrite[]; remove: string[] }> {
  let form: FormData;
  try {
    // The cap holds for chunked bodies too, which carry no Content-Length.
    form = await (await withCappedBody(request, LIMITS.pageBytes + MB)).formData();
  } catch (err) {
    if (err instanceof BodyTooLarge) throw new PageError('too_large', `uploads are limited to ${LIMITS.pageBytes / MB} MB`);
    throw new PageError('invalid', 'expected a multipart form');
  }
  const parts = form.getAll('files');
  if (parts.length > LIMITS.files) throw new PageError('too_large', `a page may hold at most ${LIMITS.files} files`);
  const files: FileWrite[] = [];
  const html = form.get('html');
  if (typeof html === 'string' && html.trim()) files.push({ path: MAIN_FILE, data: Buffer.from(html, 'utf8') });
  for (const part of parts) {
    if (typeof part === 'string') continue;
    files.push({ path: part.name, data: Buffer.from(await part.arrayBuffer()) });
  }
  const remove = form.getAll('delete').filter((v): v is string => typeof v === 'string' && v.length > 0);
  return { form, files: stripCommonFolder(files), remove };
}

/** An uploaded folder arrives as "site/index.html", "site/app.js": drop the shared top folder. */
function stripCommonFolder(files: FileWrite[]): FileWrite[] {
  const tops = new Set(files.map((f) => (f.path.includes('/') ? f.path.split('/')[0] : '')));
  if (tops.size !== 1 || tops.has('')) return files;
  const [top] = tops;
  if (!files.some((f) => f.path === `${top}/${MAIN_FILE}`)) return files;
  return files.map((f) => ({ ...f, path: f.path.slice(top.length + 1) }));
}

export function formText(form: FormData, name: string): string | undefined {
  const v = form.get(name);
  return typeof v === 'string' ? v : undefined;
}
