import 'server-only';
import { getAuth } from './auth';

// API-key authentication for agents (the MCP endpoint). Keys are verified by Better Auth, which
// also enforces expiry, revocation and the per-key rate limit. The owner is looked up on every
// request, so banning a user takes effect immediately for all of their keys. A key acts as its
// owner, limited to read or read-and-write.

export type KeyAction = 'read' | 'write';

export interface Agent {
  userId: string;
  name: string;
  keyId: string;
  keyName: string | null;
  actions: KeyAction[];
}

export function bearerToken(request: Request): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '');
  return m ? m[1] : null;
}

/** Actions stored on a key (`{ pages: [...] }`, possibly as JSON text). Unknown values are dropped. */
export function keyActions(permissions: unknown): KeyAction[] {
  let parsed = permissions;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  const pages = (parsed as { pages?: unknown } | null)?.pages;
  return Array.isArray(pages) ? (['read', 'write'] as const).filter((a) => pages.includes(a)) : [];
}

export async function authenticateAgent(request: Request): Promise<Agent | null> {
  const key = bearerToken(request);
  if (!key || !key.startsWith('hk_')) return null;
  const auth = getAuth();
  const result = await auth.api.verifyApiKey({ body: { key } });
  if (!result.valid || !result.key) return null;
  const ownerId = (result.key as { referenceId?: string; userId?: string }).referenceId ?? (result.key as { userId?: string }).userId;
  if (!ownerId) return null;
  const user = (await (await auth.$context).internalAdapter.findUserById(ownerId)) as
    | { id: string; name: string; banned?: boolean | null }
    | null;
  if (!user || user.banned) return null;
  return {
    userId: user.id,
    name: user.name,
    keyId: result.key.id,
    keyName: result.key.name ?? null,
    actions: keyActions(result.key.permissions),
  };
}
