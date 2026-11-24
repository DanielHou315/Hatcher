import 'server-only';
import { getDb } from './db';
import { emailReady } from './mail';
import { authSettings } from './settings';
import { getRegistration } from './site-settings';

/** What the sign-in and registration pages offer right now. */
export function signInMethods() {
  const s = authSettings();
  const reg = getRegistration(getDb());
  return {
    github: Boolean(s.github),
    google: Boolean(s.google),
    /** Whether anyone could register: open, by domain, or a bootstrap admin email is waiting. */
    signup: reg.mode !== 'closed' || s.adminEmails.length > 0,
    domains: reg.mode === 'domains' ? reg.domains : null,
    /** Password reset needs email. */
    reset: emailReady(),
    verification: reg.requireVerification && emailReady(),
  };
}

export type SignInMethods = ReturnType<typeof signInMethods>;

/** Only same-site paths are followed after sign-in. */
export function safeNext(next: string | undefined | null): string {
  return next && /^\/(?![/\\])/.test(next) ? next : '/';
}
