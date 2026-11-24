'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { safeNext } from '@/lib/safe-next';

interface Methods {
  github: boolean;
  google: boolean;
  signup: boolean;
  domains: string[] | null;
  reset: boolean;
  verification: boolean;
}


export function AuthForm({ mode, methods, next }: { mode: 'login' | 'signup'; methods: Methods; next?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const target = safeNext(next);
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : '';

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    const result =
      mode === 'login'
        ? await authClient.signIn.email({ email, password, callbackURL: target })
        : await authClient.signUp.email({ email, password, name: String(form.get('name') ?? ''), callbackURL: target });
    setBusy(false);
    if (result.error) {
      setError(
        result.error.status === 403 && mode === 'login'
          ? 'Confirm your email first: we sent you a link when you registered.'
          : (result.error.message ?? 'Something went wrong.'),
      );
      return;
    }
    // Accounts with two-factor sign-in finish on the code page.
    if (result.data && 'twoFactorRedirect' in result.data && result.data.twoFactorRedirect) {
      router.push(`/two-factor${nextQuery}`);
      return;
    }
    if (mode === 'signup' && methods.verification) {
      setNotice(`Almost done: we sent a confirmation link to ${email}. Open it to sign in.`);
      return;
    }
    router.push(target);
    router.refresh();
  }

  async function social(provider: 'github' | 'google') {
    await authClient.signIn.social({ provider, callbackURL: target });
  }

  if (notice) {
    return (
      <p role="status" className="measure">
        {notice}
      </p>
    );
  }

  return (
    <div className="flex max-w-sm flex-col gap-6">
      <form action={submit} className="flex flex-col gap-4">
        {mode === 'signup' && (
          <label className="field">
            <span className="label">Name</span>
            <input name="name" required autoComplete="name" />
          </label>
        )}
        <label className="field">
          <span className="label">Email</span>
          <input name="email" type="email" required autoComplete={mode === 'login' ? 'username' : 'email'} />
        </label>
        {mode === 'signup' && methods.domains && <p className="hint">Registration is open to addresses at {methods.domains.join(', ')}.</p>}
        <label className="field">
          <span className="label">Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={mode === 'signup' ? 12 : undefined}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>
        {mode === 'signup' && <p className="hint">At least 12 characters.</p>}
        {error && (
          <p role="alert" className="text-[0.92rem] text-danger">
            {error}
          </p>
        )}
        <button type="submit" className="btn" data-tone="primary" disabled={busy}>
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        {mode === 'login' && methods.reset && (
          <Link href="/forgot-password" className="text-[0.9rem]">
            Forgot your password?
          </Link>
        )}
      </form>
      {(methods.github || methods.google) && (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          {methods.github && (
            <button type="button" className="btn" onClick={() => social('github')}>
              Continue with GitHub
            </button>
          )}
          {methods.google && (
            <button type="button" className="btn" onClick={() => social('google')}>
              Continue with Google
            </button>
          )}
        </div>
      )}
      <p className="text-[0.92rem] text-muted">
        {mode === 'login' ? (
          methods.signup ? (
            <>
              No account? <Link href={`/signup${nextQuery}`}>Create one</Link>.
            </>
          ) : (
            'Accounts are by invitation. Ask an admin.'
          )
        ) : (
          <>
            Have an account? <Link href={`/login${nextQuery}`}>Sign in</Link>.
          </>
        )}
      </p>
    </div>
  );
}
