import 'server-only';
import path from 'node:path';
import fs from 'node:fs';
import { apiKey } from '@better-auth/api-key';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { admin } from 'better-auth/plugins/admin';
import { ac, roles } from './access';
import { dataDir } from './db';
import { authSettings, isStudio } from './settings';

// Better Auth: accounts, sessions, roles (admin plugin) and API keys (api-key plugin), stored in
// DATA_DIR/auth.db. Tables are created or migrated at startup (src/instrumentation.ts).

function sqlite(): typeof import('node:sqlite') {
  return process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
}

function openDatabase() {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const db = new (sqlite().DatabaseSync)(path.join(dir, 'auth.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 3000;');
  return db;
}

function createAuth() {
  const settings = authSettings();
  return betterAuth({
    appName: 'Hatcher',
    baseURL: settings.baseURL,
    secret: settings.secret,
    trustedOrigins: settings.baseURL ? [settings.baseURL] : undefined,
    database: openDatabase(),
    emailAndPassword: { enabled: true, minPasswordLength: 12, autoSignIn: true },
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
          // Sign-up policy. Admins may always create users; emails in HATCHER_ADMIN_EMAILS may sign up
          // and become admins; everyone else needs HATCHER_SIGNUP=open.
          async before(user, ctx) {
            const email = user.email.toLowerCase();
            if (settings.adminEmails.includes(email)) return { data: { ...user, role: 'admin' } };
            if (ctx?.path === '/admin/create-user') return;
            if (settings.signup !== 'open') {
              throw new APIError('FORBIDDEN', { message: 'Sign-up is by invitation. Ask an admin for an account.' });
            }
          },
        },
      },
    },
    plugins: [
      admin({ ac, roles, defaultRole: 'user', adminRoles: ['admin'] }),
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

const g = globalThis as unknown as { __hatcherAuth?: Auth };

/** The process-wide Better Auth instance, created on first use (not at build time). */
export function getAuth(): Auth {
  if (!isStudio()) throw new Error('Accounts are only available with HATCHER_MODE=studio.');
  return (g.__hatcherAuth ??= createAuth());
}

