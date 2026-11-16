'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

export function ChangePassword() {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(form: FormData) {
    const { error } = await authClient.changePassword({
      currentPassword: String(form.get('current')),
      newPassword: String(form.get('next')),
      revokeOtherSessions: true,
    });
    setMessage(error ? { ok: false, text: error.message ?? 'Could not change the password.' } : { ok: true, text: 'Password changed; other sessions were signed out.' });
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="password">
      <h2 id="password" className="font-display text-[1.65rem]">
        Password
      </h2>
      <form action={submit} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <label className="field">
          <span className="label">Current password</span>
          <input name="current" type="password" required autoComplete="current-password" />
        </label>
        <label className="field">
          <span className="label">New password</span>
          <input name="next" type="password" required minLength={12} autoComplete="new-password" />
        </label>
        <button type="submit" className="btn">
          Change
        </button>
      </form>
      {message && (
        <p role="status" className={message.ok ? 'text-done' : 'text-danger'}>
          {message.text}
        </p>
      )}
    </section>
  );
}
