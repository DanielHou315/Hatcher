import { redirect } from 'next/navigation';
import { ApiKeys } from '@/components/auth/ApiKeys';
import { ChangePassword } from '@/components/auth/ChangePassword';
import { TwoFactorSettings } from '@/components/auth/TwoFactorSettings';
import { siteURL } from '@/lib/auth';
import { getViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Account' };

export default async function AccountPage() {
  const viewer = await getViewer();
  if (!viewer) redirect('/login?next=/account');
  return (
    <div className="shell shell-main">
      <div className="measure flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="title text-[2.1rem]">Account</h1>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1">
            <dt className="label pt-[0.2rem]">Name</dt>
            <dd>{viewer.name}</dd>
            <dt className="label pt-[0.2rem]">Email</dt>
            <dd>{viewer.email}</dd>
            <dt className="label pt-[0.2rem]">Role</dt>
            <dd>{viewer.role}</dd>
          </dl>
        </header>
        <TwoFactorSettings enabled={viewer.twoFactorEnabled} />
        <ChangePassword />
        <ApiKeys mcpUrl={`${siteURL()}/api/mcp`} />
      </div>
    </div>
  );
}
