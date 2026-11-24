// Settings admins change at runtime, stored in DATA_DIR/hatcher.db (table settings). The SMTP
// password is encrypted with a key derived from BETTER_AUTH_SECRET and never sent to the browser.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db } from './db';
import { DEFAULT_CDN_HOSTS, isCdnHost } from './sandbox';

export const REGISTRATION_MODES = ['open', 'domains', 'closed'] as const;
export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export const registrationSchema = z.object({
  /** open: anyone may register. domains: only emails at the listed domains. closed: only admins create accounts. */
  mode: z.enum(REGISTRATION_MODES),
  domains: z.array(z.string().trim().toLowerCase().regex(DOMAIN_RE, 'not a domain')).max(100),
  /** New accounts must confirm their email before signing in. Needs email to be set up. */
  requireVerification: z.boolean(),
});
export type Registration = z.infer<typeof registrationSchema>;

export const SMTP_SECURITY = ['tls', 'starttls', 'none'] as const;

export const emailSchema = z.object({
  enabled: z.boolean(),
  host: z.string().trim().max(253),
  port: z.number().int().min(1).max(65535),
  /** tls: implicit TLS (usually 465). starttls: upgrade after connecting (usually 587). none: local relays only. */
  security: z.enum(SMTP_SECURITY),
  user: z.string().trim().max(320),
  from: z.string().trim().max(320),
  /** Send a welcome email when someone registers or an admin creates their account. */
  welcome: z.boolean(),
  /** Tell people when a page is shared with them. */
  shareNotices: z.boolean(),
});
export type EmailSettings = z.infer<typeof emailSchema>;

export const cdnSchema = z.object({ hosts: z.array(z.string().refine(isCdnHost, 'not a host')).max(100) });

const DEFAULTS = {
  registration: { mode: 'closed', domains: [], requireVerification: false } as Registration,
  email: { enabled: false, host: '', port: 587, security: 'starttls', user: '', from: '', welcome: true, shareNotices: true } as EmailSettings,
  cdn: { hosts: DEFAULT_CDN_HOSTS },
};

function read<T>(db: Db, key: string, schema: z.ZodType<T>, fallback: T): T {
  const raw = db.getSetting(key);
  if (!raw) return fallback;
  try {
    const parsed = schema.safeParse({ ...(fallback as object), ...JSON.parse(raw) });
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export function getRegistration(db: Db): Registration {
  return read(db, 'registration', registrationSchema, DEFAULTS.registration);
}

export function setRegistration(db: Db, value: Registration) {
  db.putSetting('registration', JSON.stringify(registrationSchema.parse(value)));
}

export function getEmailSettings(db: Db): EmailSettings & { hasPassword: boolean } {
  return { ...read(db, 'email', emailSchema, DEFAULTS.email), hasPassword: Boolean(db.getSetting('email.password')) };
}

/** `password`: a new password, '' to clear it, or undefined to keep the stored one. */
export function setEmailSettings(db: Db, value: EmailSettings, password: string | undefined, secret: string) {
  db.tx(() => {
    db.putSetting('email', JSON.stringify(emailSchema.parse(value)));
    if (password !== undefined) db.putSetting('email.password', password ? encrypt(password, secret) : '');
  });
}

export function getEmailPassword(db: Db, secret: string): string {
  const stored = db.getSetting('email.password');
  return stored ? decrypt(stored, secret) : '';
}

export function getCdnHosts(db: Db): string[] {
  return read(db, 'cdn', cdnSchema, DEFAULTS.cdn).hosts;
}

export function setCdnHosts(db: Db, hosts: string[]) {
  db.putSetting('cdn', JSON.stringify(cdnSchema.parse({ hosts })));
}

/** Whether a new account with this email may register on its own. */
export function mayRegister(reg: Registration, email: string): boolean {
  if (reg.mode === 'open') return true;
  if (reg.mode === 'closed') return false;
  const domain = email.toLowerCase().split('@').pop() ?? '';
  return reg.domains.includes(domain);
}

function keyOf(secret: string): Buffer {
  return createHash('sha256').update(`hatcher-settings:${secret}`).digest();
}

export function encrypt(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join(':');
}

export function decrypt(stored: string, secret: string): string {
  const [v, iv, tag, data] = stored.split(':');
  if (v !== 'v1' || !iv || !tag || data === undefined) throw new Error('unreadable stored secret');
  const decipher = createDecipheriv('aes-256-gcm', keyOf(secret), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
