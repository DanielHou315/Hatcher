import 'server-only';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getAuth } from './auth';
import { roleCan, type PageAction, type Role } from './roles';

// API keys for agents and the MCP server. A key's access is fixed at creation and never exceeds
// the owner's role; use-time checks (src/lib/agent-auth.ts) also re-check the owner's current role.

export const KEY_ACCESS = ['read', 'write', 'publish'] as const;
export type KeyAccess = (typeof KEY_ACCESS)[number];

const ACCESS_ACTIONS: Record<KeyAccess, PageAction[]> = {
  read: ['read'],
  write: ['read', 'write'],
  publish: ['read', 'write', 'publish'],
};

export const MAX_KEYS_PER_USER = 20;

export const createKeyBody = z.object({
  name: z.string().trim().min(1).max(32),
  access: z.enum(KEY_ACCESS),
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]),
});

export function allowedAccess(role: Role): KeyAccess[] {
  return KEY_ACCESS.filter((a) => ACCESS_ACTIONS[a].every((action) => roleCan(role, action)));
}

export interface KeySummary {
  id: string;
  name: string | null;
  start: string | null;
  access: PageAction[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

function actionsOf(permissions: unknown): PageAction[] {
  const parsed = typeof permissions === 'string' ? safeJson(permissions) : permissions;
  const pages = (parsed as { pages?: unknown } | null)?.pages;
  return Array.isArray(pages) ? (pages.filter((p) => typeof p === 'string') as PageAction[]) : [];
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export async function listKeys(): Promise<KeySummary[]> {
  const { apiKeys } = await getAuth().api.listApiKeys({ query: {}, headers: await headers() });
  return apiKeys.map((k) => ({
    id: k.id,
    name: k.name ?? null,
    start: k.start ?? null,
    access: actionsOf(k.permissions),
    createdAt: iso(k.createdAt)!,
    expiresAt: iso(k.expiresAt),
    lastUsedAt: iso(k.lastRequest),
  }));
}

export async function createKey(userId: string, body: z.infer<typeof createKeyBody>) {
  const created = await getAuth().api.createApiKey({
    body: {
      userId,
      name: body.name,
      expiresIn: body.expiresInDays ? body.expiresInDays * 86400 : undefined,
      permissions: { pages: ACCESS_ACTIONS[body.access] },
    },
  });
  return { id: created.id, key: created.key };
}

export async function deleteKey(keyId: string) {
  return getAuth().api.deleteApiKey({ body: { keyId }, headers: await headers() });
}
