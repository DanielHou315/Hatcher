import { AuthForm } from '@/components/auth/AuthForm';
import { signInMethods } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Create account' };

type Props = { searchParams: Promise<{ next?: string }> };

export default async function SignupPage({ searchParams }: Props) {
  const { next } = await searchParams;
  const methods = signInMethods();
  return (
    <div className="measure flex flex-col gap-6">
      <h1 className="title text-[2.1rem]">Create account</h1>
      {methods.signup ? <AuthForm mode="signup" methods={methods} next={next} /> : <p>Accounts are by invitation. Ask an admin.</p>}
    </div>
  );
}
