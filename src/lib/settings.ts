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

/** Origins (scheme://host[:port]) from a comma-separated list; anything that is not one is dropped. */
export function origins(value: string | undefined): string[] {
  const out: string[] = [];
  for (const item of list(value)) {
    try {
      const u = new URL(item);
      if (u.protocol === 'http:' || u.protocol === 'https:') out.push(u.origin);
    } catch {
      // not a URL
    }
  }
  return [...new Set(out)];
}

export function authSettings() {
  const env = process.env;
  const secret = env.BETTER_AUTH_SECRET;
  if (env.NODE_ENV === 'production' && (!secret || secret.length < 32)) {
    throw new Error('BETTER_AUTH_SECRET is not set or shorter than 32 characters. Generate one with: openssl rand -base64 32');
  }
  const baseURL = env.BETTER_AUTH_URL || env.SITE_ORIGIN || undefined;
  return {
    baseURL,
    /**
     * Where sign-in and other browser requests may come from: BETTER_AUTH_URL plus any other
     * addresses the site is reached at (HATCHER_TRUSTED_ORIGINS), e.g. a LAN or VPN address.
     */
    /** Headers holding the visitor's address, set (and overwritten) by the reverse proxy. */
    clientIpHeaders: list(env.HATCHER_CLIENT_IP_HEADER).length ? list(env.HATCHER_CLIENT_IP_HEADER) : ['x-forwarded-for'],
    trustedOrigins: [...new Set([...(baseURL ? origins(baseURL) : []), ...origins(env.HATCHER_TRUSTED_ORIGINS)])],
    // Development only: a fixed secret so sessions survive restarts.
    secret: secret || 'hatcher-development-secret-do-not-use-in-production',
    /** Emails that may always register, and become admins when they do. Bootstraps the first admin. */
    adminEmails: list(env.HATCHER_ADMIN_EMAILS),
    github: pair(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET),
    google: pair(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
  };
}
