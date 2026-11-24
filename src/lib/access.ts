// Better Auth access control for the admin plugin, shared by the server (auth.ts) and the browser
// (auth-client.ts). Admins manage accounts but cannot impersonate users or change their email, so
// they never see another user's pages unless those pages are shared with them.
import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements } from 'better-auth/plugins/admin/access';

export const ROLES = ['user', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const ac = createAccessControl(defaultStatements);

export const roles = {
  user: ac.newRole({ user: [], session: [] }),
  admin: ac.newRole({
    user: ['create', 'list', 'set-role', 'ban', 'delete', 'get'],
    session: ['list', 'revoke', 'delete'],
  }),
};

export function asRole(value: unknown): Role {
  // Better Auth stores multiple roles comma-separated.
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .includes('admin')
    ? 'admin'
    : 'user';
}
