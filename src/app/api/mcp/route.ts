import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import fs from 'node:fs';
import path from 'node:path';
import { authenticateAgent } from '@/lib/agent-auth';
import { contentDir } from '@/lib/content';
import { recordAudit } from '@/lib/db';
import { createMcpServer } from '@/lib/mcp/server';
import { authSettings, isStudio } from '@/lib/settings';
import pkg from '../../../../package.json';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// MCP over Streamable HTTP, stateless: every POST carries `Authorization: Bearer hk_...`, and a
// fresh server is built for that key. No sessions, no server-sent streams. Studio only.

const MAX_BODY = 32 * 1024 * 1024;

const jsonError = (status: number, message: string, headers: Record<string, string> = {}) =>
  Response.json({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }, { status, headers });

let guideCache: string | undefined;
function guide(): string {
  guideCache ??= fs.readFileSync(path.join(process.cwd(), 'docs/content-format.md'), 'utf8');
  return guideCache;
}

/** Read the body with a hard cap, whatever Content-Length claims. */
async function readBody(request: Request): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return null;
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function POST(request: Request) {
  if (!isStudio()) return new Response('Not found', { status: 404 });
  const baseURL = authSettings().baseURL ?? new URL(request.url).origin;

  // Browsers send Origin; MCP clients do not. Refuse other sites' pages (DNS rebinding, CSRF).
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(baseURL).origin) return jsonError(403, 'origin not allowed');

  const agent = await authenticateAgent(request);
  if (!agent) {
    return jsonError(401, 'missing or invalid API key; create one at /account', {
      'WWW-Authenticate': 'Bearer realm="hatcher"',
    });
  }

  const text = await readBody(request);
  if (text === null) return jsonError(413, `request body over ${MAX_BODY / 1048576} MB`);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ jsonrpc: '2.0', error: { code: -32700, message: 'parse error' }, id: null }, { status: 400 });
  }

  const server = createMcpServer({
    dir: contentDir(),
    baseURL,
    agent: { userId: agent.userId, keyId: agent.keyId, name: agent.keyName ? `${agent.name} (${agent.keyName})` : agent.name, actions: agent.actions },
    audit: recordAudit,
    guide,
    version: pkg.version,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request, { parsedBody: body });
  } finally {
    await server.close();
  }
}

const notAllowed = () =>
  isStudio() ? jsonError(405, 'this server is stateless; use POST', { Allow: 'POST' }) : new Response('Not found', { status: 404 });

export const GET = notAllowed;
export const DELETE = notAllowed;
