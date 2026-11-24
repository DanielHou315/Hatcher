import 'server-only';
import nodemailer from 'nodemailer';
import { getDb } from './db';
import { authSettings } from './settings';
import { getEmailPassword, getEmailSettings, type EmailSettings } from './site-settings';

// Outgoing email over the SMTP server an admin configured at /admin. When email is off, nothing is
// sent and callers carry on (a password reset then has to go through an admin).

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export function emailReady(s: Pick<EmailSettings, 'enabled' | 'host' | 'from'> = getEmailSettings(getDb())): boolean {
  return s.enabled && Boolean(s.host && s.from);
}

function transport(s: EmailSettings, password: string) {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.security === 'tls',
    requireTLS: s.security === 'starttls',
    ignoreTLS: s.security === 'none',
    auth: s.user ? { user: s.user, pass: password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

/** Send with the saved settings. Throws on SMTP errors; returns false when email is off. */
export async function sendMail(mail: Mail, override?: { settings: EmailSettings; password: string }): Promise<boolean> {
  const db = getDb();
  const settings = override?.settings ?? getEmailSettings(db);
  if (!override && !emailReady(settings)) return false;
  const password = override?.password ?? getEmailPassword(db, authSettings().secret);
  await transport(settings, password).sendMail({ from: settings.from, to: mail.to, subject: mail.subject, text: mail.text });
  return true;
}

/** Send without failing the caller: for notices nobody is waiting on. */
export function sendMailInBackground(mail: Mail) {
  sendMail(mail).catch((err: unknown) => console.error(`[mail] could not send "${mail.subject}" to ${mail.to}:`, err));
}

const sign = '\n\n— Hatcher';

export const templates = {
  resetPassword: (name: string, url: string): Omit<Mail, 'to'> => ({
    subject: 'Reset your Hatcher password',
    text: `Hi ${name || 'there'},\n\nSomeone asked to reset the password for your Hatcher account. To choose a new one, open:\n\n${url}\n\nThe link works for one hour. If you did not ask for this, ignore this email; your password stays the same.${sign}`,
  }),
  verifyEmail: (name: string, url: string): Omit<Mail, 'to'> => ({
    subject: 'Confirm your email for Hatcher',
    text: `Hi ${name || 'there'},\n\nConfirm this email address to finish setting up your Hatcher account:\n\n${url}${sign}`,
  }),
  welcome: (name: string, siteURL: string): Omit<Mail, 'to'> => ({
    subject: 'Welcome to Hatcher',
    text: `Hi ${name || 'there'},\n\nYour Hatcher account is ready. Sign in at ${siteURL}/login.\n\nTo keep it safe, turn on two-factor sign-in under Account once you are in.${sign}`,
  }),
  shared: (by: string, title: string, access: 'read' | 'write', url: string): Omit<Mail, 'to'> => ({
    subject: `${by} shared "${title}" with you`,
    text: `${by} shared a page with you on Hatcher${access === 'write' ? ' and you can edit it' : ''}:\n\n${title}\n${url}${sign}`,
  }),
  test: (): Omit<Mail, 'to'> => ({
    subject: 'Hatcher test email',
    text: `Email from Hatcher works.${sign}`,
  }),
};
