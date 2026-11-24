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
        <Link href="/admin" className="label no-underline hover:text-ink">
          Admin
        </Link>
      )}
      <Link href="/account" className="label max-w-[9rem] truncate no-underline hover:text-ink" title={viewer.email}>
        {viewer.name || 'Account'}
      </Link>
      <SignOutButton />
    </>
  );
}
