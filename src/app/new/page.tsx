import { redirect } from 'next/navigation';
import { NewPageForm } from '@/components/pages/NewPageForm';
import { getDb } from '@/lib/db';
import { getCdnHosts } from '@/lib/site-settings';
import { getViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New page' };

export default async function NewPage() {
  if (!(await getViewer())) redirect('/login?next=/new');
  const hosts = getCdnHosts(getDb());
  return (
    <div className="shell shell-main">
      <div className="measure flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="title text-[2.1rem]">New page</h1>
          <p className="text-muted">
            A page is an HTML document, with any files it needs beside it. It is private until you share it. Pages run sandboxed and may load
            code and fonts from this server and {hosts.length ? <span className="mono text-[0.85rem]">{hosts.join(', ')}</span> : 'no other host'}.
          </p>
        </header>
        <NewPageForm />
      </div>
    </div>
  );
}
