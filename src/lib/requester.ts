import 'server-only';
import { z } from 'zod';
import { authenticateAgent, bearerToken } from './agent-auth';
import { getAuth, siteURL } from './auth';
import { dataDir, getDb } from './db';
import { foreignOrigin } from './origin';
import type { ApiContext, FileInput } from './page-api';
import { decodeFiles } from './page-api';
import { LIMITS, PageError, type FileWrite } from './pages';
import { getCdnHosts } from './site-settings';
import { formText, readUpload } from './uploads';

// Who is calling the REST API: an API key (`Authorization: Bearer hk_...`), which acts as its owner
// limited to its own access, or the browser's session, which may do anything its user may.

const json = (status: number, error: string, headers: Record<string, string> = {}) => Response.json({ error }, { status, headers });

/** The context for an API request, or the error response to send instead. */
export async function apiContext(request: Request): Promise<ApiContext | Response> {
  const base = { db: getDb(), dataDir: dataDir(), baseURL: siteURL(request) };
  const cdnHosts = getCdnHosts(base.db);
  if (bearerToken(request)) {
    const agent = await authenticateAgent(request);
    if (!agent) return json(401, 'missing or invalid API key; create one at /account', { 'WWW-Authenticate': 'Bearer realm="hatcher"' });
    return { ...base, cdnHosts, who: { userId: agent.userId, keyId: agent.keyId, actions: agent.actions } };
  }
  // Cookies ride along with requests other sites trigger: refuse changes from foreign origins.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const rejected = foreignOrigin(request);
    if (rejected) return rejected;
  }
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session || session.user.banned) return json(401, 'sign in, or send an API key as Authorization: Bearer <key>');
  return { ...base, cdnHosts, who: { userId: session.user.id, actions: ['read', 'write'] } };
}

const MB = 1024 * 1024;
/** JSON bodies carry files as base64 or text, so allow for base64's overhead. */
const MAX_JSON = Math.ceil(LIMITS.pageBytes * 1.4) + MB;

/** Read a JSON body with a hard cap, whatever Content-Length claims. */
async function readJsonBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_JSON) throw new PageError('too_large', `request body over ${Math.round(MAX_JSON / MB)} MB`);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_JSON) {
      await reader.cancel();
      throw new PageError('too_large', `request body over ${Math.round(MAX_JSON / MB)} MB`);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new PageError('invalid', 'body is not valid JSON');
  }
}

const fileInput = z.object({
  path: z.string().max(400),
  text: z.string().optional(),
  base64: z.string().optional(),
});

const changeBody = z.object({
  title: z.string().max(LIMITS.title).optional(),
  description: z.string().max(LIMITS.description).optional(),
  note: z.string().max(500).optional(),
  expectedVersion: z.number().int().min(1).optional(),
  files: z.array(fileInput).max(LIMITS.files).optional(),
  delete: z.array(z.string().max(400)).max(LIMITS.files).optional(),
});

export interface PageChange {
  title?: string;
  description?: string;
  note?: string;
  expectedVersion?: number;
  files: FileWrite[];
  delete: string[];
}

/**
 * A page body from either form: JSON (`files: [{ path, text | base64 }]`) for programs, or
 * multipart (`files` parts named by path, `html`, `delete`, text fields) for the browser forms.
 */
export async function readPageChange(request: Request): Promise<PageChange> {
  if ((request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    const parsed = changeBody.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      throw new PageError('invalid', parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
    }
    const { files, delete: remove, ...rest } = parsed.data;
    return { ...rest, files: decodeFiles((files ?? []) as FileInput[]), delete: remove ?? [] };
  }
  const { form, files, remove } = await readUpload(request);
  const expected = formText(form, 'expectedVersion');
  return {
    title: formText(form, 'title'),
    description: formText(form, 'description'),
    note: formText(form, 'note'),
    expectedVersion: expected ? Number(expected) : undefined,
    files,
    delete: remove,
  };
}

/** `?version=N`, or undefined. */
export function versionParam(request: Request): number | undefined {
  const v = new URL(request.url).searchParams.get('version');
  if (v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new PageError('invalid', 'version must be a positive whole number');
  return n;
}
