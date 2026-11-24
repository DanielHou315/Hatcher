import { ResetPasswordForm } from '@/components/auth/PasswordReset';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Choose a new password' };

type Props = { searchParams: Promise<{ token?: string; error?: string }> };

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token, error } = await searchParams;
  return (
    <div className="shell shell-main">
      <div className="measure flex flex-col gap-6">
        <h1 className="title text-[2.1rem]">Choose a new password</h1>
        <ResetPasswordForm token={error ? null : (token ?? null)} />
      </div>
    </div>
  );
}
