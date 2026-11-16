'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

interface Methods {
  github: boolean;
  google: boolean;
  signup: boolean;
}

/** Only same-site paths are followed after sign-in. */
function safeNext(next: string | undefined): string {
  return next && /^\/(?![/\\])/.test(next) ? next : '/';
}

export function AuthForm({ mode, methods, next }: { mode: 'login' | 'signup'; methods: Methods; next?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const target = safeNext(next);

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    const result =
      mode === 'login'
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: String(form.get('name') ?? '') });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? 'Something went wrong.');
      return;
    }
    router.push(target);
    router.refresh();
  }

  async function social(provider: 'github' | 'google') {
    await authClient.signIn.social({ provider, callbackURL: target });
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
          <input name="email" type="email" required autoComplete="email" />
        </label>
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
        {error && (
          <p role="alert" className="text-[0.92rem] text-danger">
            {error}
          </p>
        )}
        <button type="submit" className="btn" data-tone="primary" disabled={busy}>
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
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
              No account? <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Create one</Link>.
            </>
          ) : (
            'Accounts are by invitation.'
          )
        ) : (
          <>
            Have an account? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Sign in</Link>.
          </>
        )}
      </p>
    </div>
  );
}
