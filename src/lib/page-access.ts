// Who may do what with a page. The owner may do everything; a share grants read or write. Admins
// have no special access to pages: they see a page only if it is theirs or shared with them.
import type { Access, Db, PageRow } from './db';

export type PageAccess = 'owner' | Access;

export function accessTo(db: Db, page: PageRow, userId: string): PageAccess | null {
  if (page.owner_id === userId) return 'owner';
  return db.share(page.id, userId)?.access ?? null;
}

export const canRead = (a: PageAccess | null) => a !== null;
export const canWrite = (a: PageAccess | null) => a === 'owner' || a === 'write';
/** Sharing, renaming and deleting stay with the owner. */
export const canManage = (a: PageAccess | null) => a === 'owner';
