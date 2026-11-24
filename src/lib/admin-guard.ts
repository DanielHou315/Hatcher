import 'server-only';
import { forbidden, unauthorized } from './api';
import { foreignOrigin } from './origin';
import { getViewer, type Viewer } from './viewer';

/** The signed-in admin, or the response to send instead. */
export async function requireAdmin(request: Request | null): Promise<{ admin: Viewer } | { error: Response }> {
  if (request) {
    const rejected = foreignOrigin(request);
    if (rejected) return { error: rejected };
  }
  const viewer = await getViewer();
  if (!viewer) return { error: unauthorized() };
  if (viewer.role !== 'admin') return { error: forbidden('admins only') };
  return { admin: viewer };
}
