import 'server-only';
import { getAuth } from './auth';
import { asRole, effectiveActions, type PageAction, type Role } from './roles';

// API-key authentication for agents (the MCP endpoint). Keys are verified by Better Auth, which
// also enforces expiry, revocation and the per-key rate limit. The owner is looked up on every
// request, so demoting or banning a user takes effect immediately for all of their keys.

export interface Agent {
  userId: string;
  name: string;
  role: Role;
  keyId: string;
  keyName: string | null;
  /** Page actions this request may perform: the key's access within the owner's current role. */
  actions: PageAction[];
}

export function bearerToken(request: Request): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '');
  return m ? m[1] : null;
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
    | { id: string; name: string; role?: string | null; banned?: boolean | null }
    | null;
  if (!user || user.banned) return null;
  const role = asRole(user.role);
  return {
    userId: user.id,
    name: user.name,
    role,
    keyId: result.key.id,
    keyName: result.key.name ?? null,
    actions: effectiveActions(result.key.permissions, role),
  };
}
