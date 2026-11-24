import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth/AuthForm';
import { safeNext, signInMethods } from '@/lib/sign-in';
import { getViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in' };

type Props = { searchParams: Promise<{ next?: string; reset?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next, reset } = await searchParams;
  if (await getViewer()) redirect(safeNext(next));
  return (
    <div className="shell shell-main">
      <div className="measure flex flex-col gap-6">
        <h1 className="title text-[2.1rem]">Sign in</h1>
        {reset === 'done' && <p className="text-done">Password changed. Sign in with the new one.</p>}
        <AuthForm mode="login" methods={signInMethods()} next={next} />
      </div>
    </div>
  );
}
