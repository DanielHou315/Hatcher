import 'server-only';
import path from 'node:path';
import fs from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { apiKey } from '@better-auth/api-key';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
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

/** The site's public URL, for links in emails and API results. */
export function siteURL(request?: Request): string {
  return (authSettings().baseURL ?? (request ? new URL(request.url).origin : 'http://localhost:3000')).replace(/\/+$/, '');
}

/** Whether any admin account exists. Until one does, HATCHER_ADMIN_EMAILS may register as admins. */
export function adminExists(): boolean {
  return Boolean(authDb().prepare("SELECT 1 FROM user WHERE ',' || role || ',' LIKE '%,admin,%' LIMIT 1").get());
}

/** Whether this email may create its own account now: a bootstrap admin (before any admin exists), or by the registration policy. */
export function mayRegisterNow(email: string): { allowed: boolean; admin: boolean } {
  const e = email.trim().toLowerCase();
  if (authSettings().adminEmails.includes(e) && !adminExists()) return { allowed: true, admin: true };
  return { allowed: mayRegister(getRegistration(getDb()), e), admin: false };
}

const CLOSED = 'Registration is closed for this email. Ask an admin for an account.';

/** Remove all of a user's API keys: after their password changes, a key minted with the old one must not live on. */
export function revokeApiKeysOf(userId: string): number {
  return Number(authDb().prepare('DELETE FROM apikey WHERE referenceId = ?').run(userId).changes);
}

/** Better Auth endpoints worth a line in the audit log, and the action name to record. */
const AUDITED: [RegExp, string][] = [
  [/^\/sign-in\//, 'sign_in'],
  [/^\/sign-up\//, 'sign_up'],
  [/^\/two-factor\/(verify-totp|verify-backup-code)$/, 'sign_in_2fa'],
  [/^\/two-factor\/(enable|disable|generate-backup-codes)$/, 'two_factor'],
  [/^\/(change-password|reset-password)$/, 'password'],
  [/^\/admin\/(create-user|set-role|ban-user|unban-user|remove-user|revoke-user-sessions?)$/, 'admin'],
];

function createAuth() {
  const settings = authSettings();
  // Read when Better Auth is built (resetAuth() rebuilds it when the setting changes). Not tied to
  // whether email works right now: switching SMTP off must not switch confirmation off.
  const requireVerification = getRegistration(getDb()).requireVerification;
  return betterAuth({
    appName: 'Hatcher',
    baseURL: settings.baseURL,
    secret: settings.secret,
    trustedOrigins: settings.trustedOrigins.length ? settings.trustedOrigins : undefined,
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
    // Rate limits go by the visitor's address, read from the header the reverse proxy sets
    // (HATCHER_CLIENT_IP_HEADER). It must be one the proxy overwrites, or visitors can pick their own.
    advanced: { ipAddress: { ipAddressHeaders: settings.clientIpHeaders } },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Decide registration before Better Auth checks whether the email exists, so a closed site
        // does not answer "already registered" for accounts it has.
        if (ctx.path === '/sign-up/email') {
          const email = String((ctx.body as { email?: unknown } | undefined)?.email ?? '');
          if (!mayRegisterNow(email).allowed) {
            getDb().audit({ userId: '-', action: 'sign_up', target: ctx.path, ok: false, detail: `${email.slice(0, 320)} registration closed` });
            throw new APIError('FORBIDDEN', { message: CLOSED });
          }
        }
        // API keys are made through /api/keys, which applies the limits; never directly.
        if (ctx.path.startsWith('/api-key/') && ctx.request) throw new APIError('NOT_FOUND');
      }),
      after: createAuthMiddleware(async (ctx) => {
        const action = AUDITED.find(([re]) => re.test(ctx.path))?.[1];
        if (!action) return;
        const returned = ctx.context.returned;
        const failed = returned instanceof APIError || returned instanceof Error;
        const userId = ctx.context.newSession?.user.id ?? ctx.context.session?.user.id ?? '-';
        const email = (ctx.body as { email?: unknown } | undefined)?.email;
        getDb().audit({
          userId,
          action,
          target: ctx.path,
          ok: !failed,
          detail: [typeof email === 'string' ? email : null, failed ? (returned as Error).message : null].filter(Boolean).join(' ') || undefined,
        });
      }),
    },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    telemetry: { enabled: false },
    databaseHooks: {
      account: {
        update: {
          // A new password ends the user's API keys too (sessions are ended by Better Auth).
          async after(account, ctx) {
            if (ctx?.path === '/reset-password' || ctx?.path === '/change-password') {
              const n = revokeApiKeysOf(account.userId);
              if (n) getDb().audit({ userId: account.userId, action: 'api_keys_revoked', ok: true, detail: `${n} after ${ctx.path}` });
            }
          },
        },
      },
      user: {
        create: {
          // Registration policy, read at the moment someone registers. Admins may always create
          // accounts; HATCHER_ADMIN_EMAILS may always register and become admins.
          async before(user, ctx) {
            if (ctx?.path === '/admin/create-user') return { data: { ...user, emailVerified: true } };
            // OAuth providers may report addresses their users never confirmed; those prove nothing
            // about the domain, or about being the admin.
            const oauth = Boolean(ctx?.path?.startsWith('/callback'));
            const reg = getRegistration(getDb());
            const { allowed, admin } = mayRegisterNow(user.email);
            if (!allowed || (oauth && !user.emailVerified && (admin || reg.mode !== 'open'))) {
              throw new APIError('FORBIDDEN', { message: CLOSED });
            }
            if (admin) return { data: { ...user, role: 'admin' } };
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

/** Whether a user exists and is not suspended. */
export function userIsActive(userId: string): boolean {
  const row = authDb().prepare('SELECT banned, banExpires FROM user WHERE id = ?').get(userId) as
    | { banned: number | null; banExpires: string | number | null }
    | undefined;
  if (!row) return false;
  if (!row.banned) return true;
  // A suspension with an end date is over once it passes.
  return row.banExpires !== null && new Date(row.banExpires).getTime() < Date.now();
}

export function userByEmail(email: string): (UserSummary & { banned: boolean }) | null {
  const row = authDb().prepare('SELECT id, name, email, banned FROM user WHERE lower(email) = ?').get(email.trim().toLowerCase()) as
    | (UserSummary & { banned: number | null })
    | undefined;
  return row ? { id: row.id, name: row.name, email: row.email, banned: Boolean(row.banned) } : null;
}
