'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

/** Second step of signing in: a code from the authenticator app, or a backup code. */
export function TwoFactorForm({ next }: { next: string }) {
  const router = useRouter();
  const [backup, setBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    const code = String(form.get('code') ?? '').replace(/\s+/g, '');
    const trustDevice = form.get('trust') === 'on';
    const { error } = backup
      ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice })
      : await authClient.twoFactor.verifyTotp({ code, trustDevice });
    setBusy(false);
    if (error) {
      setError(error.status === 401 && /expired|invalid two factor cookie/i.test(error.message ?? '') ? 'This sign-in timed out. Sign in again.' : (error.message ?? 'That code did not work.'));
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form action={submit} className="flex max-w-sm flex-col gap-4">
      <label className="field">
        <span className="label">{backup ? 'Backup code' : 'Code from your authenticator app'}</span>
        <input
          name="code"
          required
          autoFocus
          autoComplete="one-time-code"
          inputMode={backup ? 'text' : 'numeric'}
          pattern={backup ? undefined : '[0-9 ]{6,7}'}
          key={String(backup)}
        />
      </label>
      <label className="check">
        <input type="checkbox" name="trust" />
        <span>Trust this device for 30 days</span>
      </label>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <button className="btn" data-tone="primary" disabled={busy}>
        Verify
      </button>
      <button type="button" className="w-fit cursor-pointer text-[0.9rem] text-accent underline" onClick={() => setBackup(!backup)}>
        {backup ? 'Use the authenticator app instead' : 'Lost your phone? Use a backup code'}
      </button>
    </form>
  );
}
