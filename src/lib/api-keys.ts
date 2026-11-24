import 'server-only';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getAuth } from './auth';
import { keyActions, type KeyAction } from './agent-auth';

// API keys for agents and scripts using the REST API. A key acts as its owner, limited to reading (read) or
// reading and writing (write) the pages its owner can reach.

export const KEY_ACCESS = ['read', 'write'] as const;
export type KeyAccess = (typeof KEY_ACCESS)[number];

const ACCESS_ACTIONS: Record<KeyAccess, KeyAction[]> = {
  read: ['read'],
  write: ['read', 'write'],
};

export const MAX_KEYS_PER_USER = 20;

export const createKeyBody = z.object({
  name: z.string().trim().min(1).max(32),
  access: z.enum(KEY_ACCESS),
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]),
});

export interface KeySummary {
  id: string;
  name: string | null;
  start: string | null;
  access: KeyAction[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export async function listKeys(): Promise<KeySummary[]> {
  const { apiKeys } = await getAuth().api.listApiKeys({ query: {}, headers: await headers() });
  return apiKeys.map((k) => ({
    id: k.id,
    name: k.name ?? null,
    start: k.start ?? null,
    access: keyActions(k.permissions),
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
