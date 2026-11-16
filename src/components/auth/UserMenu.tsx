import Link from 'next/link';
import type { Viewer } from '@/lib/viewer';
import { SignOutButton } from './SignOutButton';

export function UserMenu({ viewer }: { viewer: Viewer | null }) {
  if (!viewer) {
    return (
      <Link href="/login" className="label no-underline hover:text-ink">
        Sign in
      </Link>
    );
  }
  return (
    <>
      {viewer.role === 'admin' && (
        <Link href="/admin/users" className="label no-underline hover:text-ink">
          Users
        </Link>
      )}
      <Link href="/account" className="label no-underline hover:text-ink" title={viewer.email}>
        {viewer.name || 'Account'}
      </Link>
      <SignOutButton />
    </>
  );
}
