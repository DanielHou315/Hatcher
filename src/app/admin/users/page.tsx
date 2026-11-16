import { notFound, redirect } from 'next/navigation';
import { UserAdmin } from '@/components/auth/UserAdmin';
import { getViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Users' };

export default async function UsersPage() {
  const viewer = await getViewer();
  if (!viewer) redirect('/login?next=/admin/users');
  if (viewer.role !== 'admin') notFound();
  return (
    <div className="flex flex-col gap-6">
      <div className="measure flex flex-col gap-2">
        <h1 className="title text-[2.1rem]">Users</h1>
        <p className="text-muted">
          Readers (<b>user</b>) see published pages and track progress. <b>Editors</b> also see drafts and write them through
          API keys. <b>Admins</b> also publish and manage users.
        </p>
      </div>
      <UserAdmin selfId={viewer.id} />
    </div>
  );
}
