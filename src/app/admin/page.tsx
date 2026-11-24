import { notFound, redirect } from 'next/navigation';
import { SiteSettings } from '@/components/auth/SiteSettings';
import { UserAdmin } from '@/components/auth/UserAdmin';
import { getDb } from '@/lib/db';
import { emailReady } from '@/lib/mail';
import { getCdnHosts, getEmailSettings, getQuota, getRegistration } from '@/lib/site-settings';
import { getViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin' };

export default async function AdminPage() {
  const viewer = await getViewer();
  if (!viewer) redirect('/login?next=/admin');
  if (viewer.role !== 'admin') notFound();
  const db = getDb();
  const email = getEmailSettings(db);
  const settings = { registration: getRegistration(db), email, emailReady: emailReady(email), cdnHosts: getCdnHosts(db), quota: getQuota(db) };

  return (
    <div className="shell shell-main">
      <div className="flex flex-col gap-6">
        <header className="measure flex flex-col gap-2">
          <h1 className="title text-[2.1rem]">Admin</h1>
          <p className="text-muted">
            Admins manage accounts and site settings. They do not see other people’s pages unless those pages are shared with them.
          </p>
          <nav className="flex flex-wrap gap-4 text-[0.92rem]">
            <a href="#users">Users</a>
            <a href="#registration">Registration</a>
            <a href="#email">Email</a>
            <a href="#cdn">What pages may load</a>
            <a href="#quota">Quotas</a>
          </nav>
        </header>
        <section id="users" className="panel scroll-mt-20">
          <h2>Users</h2>
          <UserAdmin selfId={viewer.id} canEmail={settings.emailReady} verification={settings.registration.requireVerification} />
        </section>
        <div className="measure flex flex-col gap-6">
          <SiteSettings initial={settings} />
        </div>
      </div>
    </div>
  );
}
