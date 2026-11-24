import 'server-only';
import { LIMITS, MAIN_FILE, PageError, type FileWrite } from './pages';

const MB = 1024 * 1024;

/** Requests from the browser forms: files arrive as multipart parts named "files" (filename = path inside the page). */
export async function readUpload(request: Request): Promise<{ form: FormData; files: FileWrite[]; remove: string[] }> {
  if (Number(request.headers.get('content-length') ?? 0) > LIMITS.pageBytes + MB) {
    throw new PageError('too_large', `uploads are limited to ${LIMITS.pageBytes / MB} MB`);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new PageError('invalid', 'expected a multipart form');
  }
  const files: FileWrite[] = [];
  const html = form.get('html');
  if (typeof html === 'string' && html.trim()) files.push({ path: MAIN_FILE, data: Buffer.from(html, 'utf8') });
  for (const part of form.getAll('files')) {
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
