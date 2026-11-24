import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CDN_HOSTS } from '@/lib/sandbox';
import {
  decrypt,
  encrypt,
  getCdnHosts,
  getEmailPassword,
  getEmailSettings,
  getRegistration,
  mayRegister,
  setCdnHosts,
  setEmailSettings,
  setRegistration,
} from '@/lib/site-settings';
import { tempEnv, type Env } from './helpers';

let env: Env;
beforeEach(() => {
  env = tempEnv();
});
afterEach(() => env.cleanup());

describe('site settings', () => {
  it('starts closed, with email off and the default CDN hosts', () => {
    expect(getRegistration(env.db)).toEqual({ mode: 'closed', domains: [], requireVerification: false });
    expect(getEmailSettings(env.db)).toMatchObject({ enabled: false, hasPassword: false });
    expect(getCdnHosts(env.db)).toEqual(DEFAULT_CDN_HOSTS);
  });

  it('applies the registration policy', () => {
    expect(mayRegister({ mode: 'open', domains: [], requireVerification: false }, 'a@x.com')).toBe(true);
    expect(mayRegister({ mode: 'closed', domains: [], requireVerification: false }, 'a@x.com')).toBe(false);
    const domains = { mode: 'domains' as const, domains: ['umich.edu'], requireVerification: false };
    expect(mayRegister(domains, 'A@UMICH.EDU')).toBe(true);
    expect(mayRegister(domains, 'a@evil-umich.edu')).toBe(false);
    expect(mayRegister(domains, 'a@umich.edu.evil.com')).toBe(false);
    setRegistration(env.db, domains);
    expect(getRegistration(env.db)).toEqual(domains);
  });

  it('stores the SMTP password encrypted, keeps it when not given, and clears it with an empty string', () => {
    const smtp = { enabled: true, host: 'smtp.example.com', port: 587, security: 'starttls' as const, user: 'u', from: 'H <h@example.com>', welcome: true, shareNotices: false };
    setEmailSettings(env.db, smtp, 'hunter2', 'secret');
    expect(env.db.getSetting('email.password')).not.toContain('hunter2');
    expect(getEmailPassword(env.db, 'secret')).toBe('hunter2');
    expect(() => getEmailPassword(env.db, 'wrong secret')).toThrow();
    setEmailSettings(env.db, { ...smtp, port: 465 }, undefined, 'secret');
    expect(getEmailPassword(env.db, 'secret')).toBe('hunter2');
    expect(getEmailSettings(env.db)).toMatchObject({ port: 465, hasPassword: true });
    setEmailSettings(env.db, smtp, '', 'secret');
    expect(getEmailSettings(env.db).hasPassword).toBe(false);
  });

  it('round-trips encryption with a fresh IV each time', () => {
    expect(encrypt('x', 'k')).not.toBe(encrypt('x', 'k'));
    expect(decrypt(encrypt('pässword', 'k'), 'k')).toBe('pässword');
  });

  it('validates CDN hosts', () => {
    setCdnHosts(env.db, ['unpkg.com']);
    expect(getCdnHosts(env.db)).toEqual(['unpkg.com']);
    expect(() => setCdnHosts(env.db, ['*'])).toThrow();
  });
});

describe('trusted origins', () => {
  it('keeps BETTER_AUTH_URL first and adds valid extra origins only', async () => {
    const { authSettings, origins } = await import('@/lib/settings');
    expect(origins('http://192.168.1.10:3100/, https://H.example.com/path, nonsense, ftp://x.y')).toEqual([
      'http://192.168.1.10:3100',
      'https://h.example.com',
    ]);
    const saved = { ...process.env };
    try {
      process.env.BETTER_AUTH_URL = 'https://hatcher.example.com';
      process.env.HATCHER_TRUSTED_ORIGINS = 'http://10.0.0.5:3100,https://hatcher.example.com';
      expect(authSettings().trustedOrigins).toEqual(['https://hatcher.example.com', 'http://10.0.0.5:3100']);
    } finally {
      process.env = saved;
    }
  });
});
