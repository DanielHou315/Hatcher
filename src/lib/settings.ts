// Deployment settings read from the environment. Every variable is listed in .envrc.example.

/**
 * public (default): the anonymous, read-only site. Published pages only, no accounts, no write
 * APIs, no secrets or user database. studio: the sign-in-only instance for accounts, drafts, API
 * keys and the MCP endpoint. Run them as separate processes from the same image.
 */
export type HatcherMode = 'public' | 'studio';

export function hatcherMode(): HatcherMode {
  return process.env.HATCHER_MODE === 'studio' ? 'studio' : 'public';
}

export const isStudio = () => hatcherMode() === 'studio';

export type SignupMode = 'open' | 'closed';

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function pair(id: string | undefined, secret: string | undefined) {
  return id && secret ? { clientId: id, clientSecret: secret } : undefined;
}

export function authSettings() {
  const env = process.env;
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret && env.NODE_ENV === 'production') {
    throw new Error('BETTER_AUTH_SECRET is not set. Generate one with: openssl rand -base64 32');
  }
  return {
    baseURL: env.BETTER_AUTH_URL || env.SITE_ORIGIN || undefined,
    // Development only: a fixed secret so sessions survive restarts.
    secret: secret || 'hatcher-development-secret-do-not-use-in-production',
    adminEmails: list(env.HATCHER_ADMIN_EMAILS),
    signup: (env.HATCHER_SIGNUP === 'open' ? 'open' : 'closed') as SignupMode,
    github: pair(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET),
    google: pair(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
  };
}

/** Which sign-in methods the login page offers. */
export function signInMethods() {
  const s = authSettings();
  return { github: Boolean(s.github), google: Boolean(s.google), signup: s.signup === 'open' || s.adminEmails.length > 0 };
}
