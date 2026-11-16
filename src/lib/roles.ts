// Roles and what they may do with pages. Shared by the auth config (Better Auth admin plugin),
// page rendering, and the MCP server.

export const ROLES = ['user', 'editor', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const PAGE_ACTIONS = ['read', 'write', 'publish'] as const;
export type PageAction = (typeof PAGE_ACTIONS)[number];

/** user: read published pages and track progress. editor: also see drafts and write them. admin: also publish and manage users. */
export const ROLE_PAGE_ACTIONS: Record<Role, PageAction[]> = {
  user: ['read'],
  editor: ['read', 'write'],
  admin: ['read', 'write', 'publish'],
};

export function asRole(value: unknown): Role {
  // Better Auth stores multiple roles comma-separated; take the strongest one we know.
  const parts = String(value ?? '').split(',').map((s) => s.trim());
  for (const role of [...ROLES].reverse()) if (parts.includes(role)) return role;
  return 'user';
}

export function roleCan(role: Role, action: PageAction): boolean {
  return ROLE_PAGE_ACTIONS[role].includes(action);
}

/** Drafts and invalid pages are visible to anyone who may write. */
export function canSeeDrafts(role: Role | null): boolean {
  return role !== null && roleCan(role, 'write');
}
