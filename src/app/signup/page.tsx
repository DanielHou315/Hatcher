import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth/AuthForm';
import { safeNext, signInMethods } from '@/lib/sign-in';
import { getViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Create account' };

type Props = { searchParams: Promise<{ next?: string }> };

export default async function SignupPage({ searchParams }: Props) {
  const { next } = await searchParams;
  if (await getViewer()) redirect(safeNext(next));
  const methods = signInMethods();
  return (
    <div className="shell shell-main">
      <div className="measure flex flex-col gap-6">
        <h1 className="title text-[2.1rem]">Create account</h1>
        {methods.signup ? <AuthForm mode="signup" methods={methods} next={next} /> : <p>Registration is closed. Ask an admin for an account.</p>}
      </div>
    </div>
  );
}
