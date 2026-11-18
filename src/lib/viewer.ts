import 'server-only';
import { headers } from 'next/headers';
import { cache } from 'react';
import { getAuth } from './auth';
import { getSite, type Site } from './content';
import { signContentToken } from './content-token';
import { canSeeDrafts, asRole, type Role } from './roles';
import { authSettings, isStudio } from './settings';
import { KIND_DIRS, type Kind } from './kinds';

export interface Viewer {
  id: string;
  name: string;
  email: string;
  role: Role;
}

/** The signed-in user for this request, or null. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (!isStudio()) return null; // the public site has no accounts
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session || session.user.banned) return null;
  const { id, name, email, role } = session.user;
  return { id, name, email, role: asRole(role) };
});

/** The site as the current viewer may see it. */
export async function viewerSite(): Promise<{ viewer: Viewer | null; site: Site }> {
  const viewer = await getViewer();
  return { viewer, site: getSite({ drafts: canSeeDrafts(viewer?.role ?? null) }) };
}

/** Whether this page's sandboxed content is served without a token: published pages on the public site. */
export function isPublicContent(entry: { status: string; error?: string }): boolean {
  return !isStudio() && !entry.error && entry.status === 'ready';
}

/** A content token for a page that is not public, for the viewer who is allowed to see it. */
export function contentTokenFor(entry: { kind: Kind; slug: string; status: string; error?: string }): string | undefined {
  if (!isStudio() || isPublicContent(entry)) return undefined;
  return signContentToken(authSettings().secret, `${KIND_DIRS[entry.kind]}/${entry.slug}`);
}
