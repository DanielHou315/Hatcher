// Better Auth access control: the admin plugin's statements plus page actions. Shared by the
// server (src/lib/auth.ts) and the client (src/lib/auth-client.ts); mirrors src/lib/roles.ts.
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access';
import { createAccessControl } from 'better-auth/plugins/access';

const statements = { ...defaultStatements, pages: ['read', 'write', 'publish'] } as const;

export const ac = createAccessControl(statements);

export const roles = {
  user: ac.newRole({ pages: ['read'] }),
  editor: ac.newRole({ pages: ['read', 'write'] }),
  admin: ac.newRole({ ...adminAc.statements, pages: ['read', 'write', 'publish'] }),
};
