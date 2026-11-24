import Link from 'next/link';
import { ForgotPasswordForm } from '@/components/auth/PasswordReset';
import { signInMethods } from '@/lib/sign-in';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reset password' };

export default function ForgotPasswordPage() {
  const { reset } = signInMethods();
  return (
    <div className="shell shell-main">
      <div className="measure flex flex-col gap-6">
        <h1 className="title text-[2.1rem]">Reset password</h1>
        {reset ? (
          <ForgotPasswordForm />
        ) : (
          <p>
            This server cannot send email, so ask an admin to set a new password for you. <Link href="/login">Back to sign in</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
