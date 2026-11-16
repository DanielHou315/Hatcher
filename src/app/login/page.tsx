import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth/AuthForm';
import { signInMethods } from '@/lib/settings';
import { getViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in' };

type Props = { searchParams: Promise<{ next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;
  if (await getViewer()) redirect(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
  return (
    <div className="measure flex flex-col gap-6">
      <h1 className="title text-[2.1rem]">Sign in</h1>
      <AuthForm mode="login" methods={signInMethods()} next={next} />
    </div>
  );
}
