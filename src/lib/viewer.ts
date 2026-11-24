import 'server-only';
import { headers } from 'next/headers';
import { cache } from 'react';
import { asRole, type Role } from './access';
import { getAuth } from './auth';

export interface Viewer {
  id: string;
  name: string;
  email: string;
  role: Role;
  twoFactorEnabled: boolean;
  /** When this sign-in happened, for actions that need a recent one. */
  sessionCreatedAt: string;
}

/** The signed-in user for this request, or null. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session || session.user.banned) return null;
  const { id, name, email, role } = session.user;
  return { id, name, email, role: asRole(role), twoFactorEnabled: Boolean(session.user.twoFactorEnabled),
    sessionCreatedAt: new Date(session.session.createdAt).toISOString(),
  };
});
