'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

export function ForgotPasswordForm() {
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (sent) {
    return <p role="status">If {sent} has an account, a reset link is on its way. It works for one hour.</p>;
  }
  return (
    <form
      className="flex max-w-sm flex-col gap-4"
      action={async (form) => {
        setBusy(true);
        const email = String(form.get('email') ?? '');
        // The answer is the same whether or not the account exists.
        await authClient.requestPasswordReset({ email, redirectTo: `${location.origin}/reset-password` });
        setSent(email);
      }}
    >
      <label className="field">
        <span className="label">Email</span>
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <button className="btn" data-tone="primary" disabled={busy}>
        Send reset link
      </button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!token) {
    return (
      <p>
        This link is incomplete or has expired. <Link href="/forgot-password">Ask for a new one</Link>.
      </p>
    );
  }
  return (
    <form
      className="flex max-w-sm flex-col gap-4"
      action={async (form) => {
        setBusy(true);
        setError(null);
        const { error } = await authClient.resetPassword({ newPassword: String(form.get('password') ?? ''), token });
        setBusy(false);
        if (error) setError(error.message ?? 'The link has expired. Ask for a new one.');
        else router.push('/login?reset=done');
      }}
    >
      <label className="field">
        <span className="label">New password</span>
        <input name="password" type="password" required minLength={12} autoComplete="new-password" />
      </label>
      <p className="hint">At least 12 characters. Every device signed in to this account will be signed out.</p>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <button className="btn" data-tone="primary" disabled={busy}>
        Set password
      </button>
    </form>
  );
}
