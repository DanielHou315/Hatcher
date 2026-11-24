// Deployment settings read from the environment. Every variable is listed in .envrc.example.
// Settings an admin changes at runtime (registration, email, CDN hosts) are in site-settings.ts.

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
    /** Emails that may always register, and become admins when they do. Bootstraps the first admin. */
    adminEmails: list(env.HATCHER_ADMIN_EMAILS),
    github: pair(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET),
    google: pair(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
  };
}
