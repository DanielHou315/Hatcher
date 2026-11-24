import 'server-only';
import path from 'node:path';
import fs from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { apiKey } from '@better-auth/api-key';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { admin } from 'better-auth/plugins/admin';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { ac, roles } from './access';
import { dataDir, getDb, sqlite } from './db';
import { emailReady, sendMail, sendMailInBackground, templates } from './mail';
import { deletePage } from './pages';
import { authSettings } from './settings';
import { getEmailSettings, getRegistration, mayRegister } from './site-settings';

// Better Auth: accounts, sessions, roles (admin plugin), authenticator-app 2FA (two-factor plugin)
// and API keys (api-key plugin), stored in DATA_DIR/auth.db. Tables are created or migrated at
// startup (src/instrumentation.ts). Settings an admin changes at runtime are read when they apply;
// the one Better Auth reads only at construction (email verification) rebuilds it via resetAuth().

const g = globalThis as unknown as { __hatcherAuth?: Auth; __hatcherAuthDb?: DatabaseSync };

/** Better Auth's database, also used read-only to look up names and emails for pages and shares. */
export function authDb(): DatabaseSync {
  if (!g.__hatcherAuthDb) {
    const dir = dataDir();
    fs.mkdirSync(dir, { recursive: true });
    const db = new (sqlite().DatabaseSync)(path.join(dir, 'auth.db'));
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA busy_timeout = 3000;');
    g.__hatcherAuthDb = db;
  }
  return g.__hatcherAuthDb;
}

/** The site's public URL, for links in emails and MCP results. */
export function siteURL(request?: Request): string {
  return (authSettings().baseURL ?? (request ? new URL(request.url).origin : 'http://localhost:3000')).replace(/\/+$/, '');
}

function createAuth() {
  const settings = authSettings();
  const requireVerification = getRegistration(getDb()).requireVerification && emailReady();
  return betterAuth({
    appName: 'Hatcher',
    baseURL: settings.baseURL,
    secret: settings.secret,
    trustedOrigins: settings.baseURL ? [settings.baseURL] : undefined,
    database: authDb(),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      autoSignIn: !requireVerification,
      requireEmailVerification: requireVerification,
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, url }) {
        // Without email the request quietly does nothing, so it cannot be used to probe for accounts.
        if (emailReady()) await sendMail({ to: user.email, ...templates.resetPassword(user.name, url) });
      },
    },
    emailVerification: {
      sendOnSignUp: requireVerification,
      autoSignInAfterVerification: true,
      async sendVerificationEmail({ user, url }) {
        if (emailReady()) await sendMail({ to: user.email, ...templates.verifyEmail(user.name, url) });
      },
    },
    socialProviders: {
      ...(settings.github ? { github: settings.github } : {}),
      ...(settings.google ? { google: settings.google } : {}),
    },
    rateLimit: { enabled: true, window: 60, max: 100 },
    // Behind Cloudflare and Caddy: rate-limit by the visitor's address, not the proxy's.
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'] } },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    telemetry: { enabled: false },
    databaseHooks: {
      user: {
        create: {
          // Registration policy, read at the moment someone registers. Admins may always create
          // accounts; HATCHER_ADMIN_EMAILS may always register and become admins.
          async before(user, ctx) {
            const email = user.email.toLowerCase();
            if (settings.adminEmails.includes(email)) return { data: { ...user, role: 'admin' } };
            if (ctx?.path === '/admin/create-user') return { data: { ...user, emailVerified: true } };
            if (!mayRegister(getRegistration(getDb()), email)) {
              throw new APIError('FORBIDDEN', { message: 'Registration is closed for this email. Ask an admin for an account.' });
            }
          },
          async after(user) {
            if (emailReady() && getEmailSettings(getDb()).welcome) {
              sendMailInBackground({ to: user.email, ...templates.welcome(user.name, siteURL()) });
            }
          },
        },
        delete: {
          // A deleted account takes its pages with it, and leaves every page shared with it.
          async after(user) {
            const db = getDb();
            for (const id of db.pageIdsOwnedBy(user.id)) deletePage(db, dataDir(), id);
            db.deleteSharesOf(user.id);
          },
        },
      },
    },
    plugins: [
      admin({ ac, roles, defaultRole: 'user', adminRoles: ['admin'] }),
      twoFactor({ issuer: 'Hatcher' }),
      apiKey({
        defaultPrefix: 'hk_',
        requireName: true,
        enableMetadata: true,
        // Generous limits for agents; Better Auth's default is 10 requests a day.
        rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 600 },
        permissions: { defaultPermissions: { pages: ['read'] } },
      }),
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** The process-wide Better Auth instance, created on first use (not at build time). */
export function getAuth(): Auth {
  return (g.__hatcherAuth ??= createAuth());
}

/** Rebuild Better Auth on next use, after a setting it reads at construction changed. */
export function resetAuth() {
  g.__hatcherAuth = undefined;
}

export interface UserSummary {
  id: string;
  name: string;
  email: string;
}

/** Names and emails for user ids. Unknown ids are left out. */
export function usersById(ids: string[]): Map<string, UserSummary> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = authDb()
    .prepare(`SELECT id, name, email FROM user WHERE id IN (${unique.map(() => '?').join(',')})`)
    .all(...unique) as unknown as UserSummary[];
  return new Map(rows.map((r) => [r.id, r]));
}

export function userByEmail(email: string): (UserSummary & { banned: boolean }) | null {
  const row = authDb().prepare('SELECT id, name, email, banned FROM user WHERE lower(email) = ?').get(email.trim().toLowerCase()) as
    | (UserSummary & { banned: number | null })
    | undefined;
  return row ? { id: row.id, name: row.name, email: row.email, banned: Boolean(row.banned) } : null;
}
