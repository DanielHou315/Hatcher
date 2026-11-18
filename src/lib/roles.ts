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

/** Page actions stored on an API key (`{ pages: [...] }`, possibly as JSON text). Unknown values are dropped. */
export function pageActionsOf(permissions: unknown): PageAction[] {
  let parsed = permissions;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  const pages = (parsed as { pages?: unknown } | null)?.pages;
  return Array.isArray(pages) ? PAGE_ACTIONS.filter((a) => pages.includes(a)) : [];
}

/** What an API key may do now: its own access, limited by its owner's current role. */
export function effectiveActions(keyPermissions: unknown, role: Role): PageAction[] {
  return pageActionsOf(keyPermissions).filter((a) => roleCan(role, a));
}
