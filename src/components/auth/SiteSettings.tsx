'use client';

import { useState, type ReactNode } from 'react';
import { call, jsonInit } from '@/lib/client-fetch';

type Mode = 'open' | 'domains' | 'closed';
type Security = 'tls' | 'starttls' | 'none';

export interface Settings {
  registration: { mode: Mode; domains: string[]; requireVerification: boolean };
  email: {
    enabled: boolean;
    host: string;
    port: number;
    security: Security;
    user: string;
    from: string;
    welcome: boolean;
    shareNotices: boolean;
    hasPassword: boolean;
  };
  emailReady: boolean;
  cdnHosts: string[];
  quota: { default: { storageMB: number; pages: number }; users: Record<string, { storageMB: number; pages: number }> };
}

function useSave(setSettings: (s: Settings) => void) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function save(body: object, done = 'Saved.') {
    setBusy(true);
    setMessage(null);
    try {
      setSettings(await call<Settings>('/api/admin/settings', jsonInit('PUT', body)));
      setMessage({ ok: true, text: done });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, setMessage, save, setBusy };
}

function Message({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null;
  return (
    <p role={m.ok ? 'status' : 'alert'} className={m.ok ? 'text-done' : 'text-danger'}>
      {m.text}
    </p>
  );
}

function Panel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="panel scroll-mt-20">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function RegistrationSettings({ settings, setSettings }: { settings: Settings; setSettings: (s: Settings) => void }) {
  const s = useSave(setSettings);
  const [mode, setMode] = useState<Mode>(settings.registration.mode);
  return (
    <Panel id="registration" title="Registration">
      <form
        className="flex flex-col gap-4"
        action={(form) =>
          s.save({
            registration: {
              mode,
              domains: String(form.get('domains') ?? '')
                .split(/[\s,]+/)
                .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
                .filter(Boolean),
              requireVerification: form.get('verify') === 'on',
            },
          })
        }
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="label mb-1">Who may create an account</legend>
          {(
            [
              ['open', 'Anyone', 'Anyone who can reach this site can register.'],
              ['domains', 'Only some email domains', 'For example your company or university.'],
              ['closed', 'Nobody: admins add accounts', 'Registration is off. Add people below under Users.'],
            ] as const
          ).map(([value, label, hint]) => (
            <label key={value} className="check">
              <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
              <span>
                {label} <span className="hint">· {hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {mode === 'domains' && (
          <label className="field">
            <span className="label">Allowed domains</span>
            <input name="domains" defaultValue={settings.registration.domains.join(', ')} placeholder="example.com, example.org" required />
          </label>
        )}
        <label className="check">
          <input type="checkbox" name="verify" defaultChecked={settings.registration.requireVerification} disabled={!settings.emailReady} />
          <span>
            New accounts must confirm their email before signing in
            {!settings.emailReady && <span className="hint"> · needs email, below</span>}
          </span>
        </label>
        {mode === 'domains' && <p className="hint">Registration by domain requires confirming the email, so email must be set up.</p>}
        <p className="hint">Until an admin exists, emails in HATCHER_ADMIN_EMAILS can register and become admins.</p>
        <Message m={s.message} />
        <button className="btn w-fit" data-tone="primary" disabled={s.busy}>
          Save
        </button>
      </form>
    </Panel>
  );
}

export function EmailSettings({ settings, setSettings }: { settings: Settings; setSettings: (s: Settings) => void }) {
  const s = useSave(setSettings);
  const e = settings.email;
  const [security, setSecurity] = useState<Security>(e.security);
  const [port, setPort] = useState(String(e.port));

  function read(form: FormData) {
    const password = String(form.get('password') ?? '');
    return {
      settings: {
        enabled: form.get('enabled') === 'on',
        host: String(form.get('host') ?? ''),
        port: Number(port),
        security,
        user: String(form.get('user') ?? ''),
        from: String(form.get('from') ?? ''),
        welcome: form.get('welcome') === 'on',
        shareNotices: form.get('shareNotices') === 'on',
      },
      // Blank keeps the stored password; "clear" removes it.
      password: form.get('clearPassword') === 'on' ? '' : password || undefined,
    };
  }

  async function test(form: HTMLFormElement) {
    const { settings: draft, password } = read(new FormData(form));
    s.setBusy(true);
    s.setMessage(null);
    try {
      const r = await call<{ to: string }>('/api/admin/email-test', jsonInit('POST', { settings: draft, password }));
      s.setMessage({ ok: true, text: `Sent a test email to ${r.to}.` });
    } catch (err) {
      s.setMessage({ ok: false, text: `Could not send: ${(err as Error).message}` });
    } finally {
      s.setBusy(false);
    }
  }

  return (
    <Panel id="email" title="Email">
      <p className="hint">
        Outgoing mail for password resets, email confirmation, welcome messages and share notices, through any SMTP server (your mail
        provider, Amazon SES, Postmark, Resend, Mailgun…). The password is stored encrypted.
      </p>
      <form
        className="flex flex-col gap-4"
        action={(form) => {
          const { settings: draft, password } = read(form);
          return s.save({ email: { ...draft, password } });
        }}
      >
        <label className="check">
          <input type="checkbox" name="enabled" defaultChecked={e.enabled} />
          <span>Send email</span>
        </label>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem_10rem]">
          <label className="field">
            <span className="label">SMTP server</span>
            <input name="host" defaultValue={e.host} placeholder="smtp.example.com" />
          </label>
          <label className="field">
            <span className="label">Port</span>
            <input value={port} onChange={(ev) => setPort(ev.target.value)} inputMode="numeric" />
          </label>
          <label className="field">
            <span className="label">Security</span>
            <select
              value={security}
              onChange={(ev) => {
                const v = ev.target.value as Security;
                setSecurity(v);
                setPort(v === 'tls' ? '465' : v === 'starttls' ? '587' : '25');
              }}
            >
              <option value="starttls">STARTTLS</option>
              <option value="tls">TLS</option>
              <option value="none">None (local relay)</option>
            </select>
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field">
            <span className="label">Username</span>
            <input name="user" defaultValue={e.user} autoComplete="off" />
          </label>
          <label className="field">
            <span className="label">Password {e.hasPassword && <span className="hint">· saved; leave blank to keep</span>}</span>
            <input name="password" type="password" autoComplete="new-password" />
          </label>
        </div>
        {e.hasPassword && (
          <label className="check">
            <input type="checkbox" name="clearPassword" />
            <span>Remove the saved password</span>
          </label>
        )}
        <label className="field">
          <span className="label">From</span>
          <input name="from" defaultValue={e.from} placeholder="Hatcher <hatcher@example.com>" />
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="label mb-1">Also send</legend>
          <label className="check">
            <input type="checkbox" name="welcome" defaultChecked={e.welcome} />
            <span>A welcome email to new accounts</span>
          </label>
          <label className="check">
            <input type="checkbox" name="shareNotices" defaultChecked={e.shareNotices} />
            <span>A notice when a page is shared with someone</span>
          </label>
        </fieldset>
        <Message m={s.message} />
        <div className="flex flex-wrap gap-2">
          <button className="btn" data-tone="primary" disabled={s.busy}>
            Save
          </button>
          <button type="button" className="btn" disabled={s.busy} onClick={(ev) => test(ev.currentTarget.form!)}>
            Send a test to me
          </button>
        </div>
      </form>
    </Panel>
  );
}

export function CdnSettings({ settings, setSettings }: { settings: Settings; setSettings: (s: Settings) => void }) {
  const s = useSave(setSettings);
  return (
    <Panel id="cdn" title="What pages may load">
      <p className="hint">
        Pages run sandboxed. Besides their own files they may load scripts, styles, fonts, images and data from these hosts, over HTTPS, and
        send data nowhere else. One host per line; <span className="mono">*.example.com</span> covers subdomains.
      </p>
      <form className="flex flex-col gap-4" action={(form) => s.save({ cdnHosts: String(form.get('hosts') ?? '') })}>
        <label className="field">
          <span className="label">Allowed hosts</span>
          <textarea name="hosts" rows={8} defaultValue={settings.cdnHosts.join('\n')} spellCheck={false} />
        </label>
        <Message m={s.message} />
        <button className="btn w-fit" data-tone="primary" disabled={s.busy}>
          Save
        </button>
      </form>
    </Panel>
  );
}

export function QuotaSettings({ settings, setSettings }: { settings: Settings; setSettings: (s: Settings) => void }) {
  const s = useSave(setSettings);
  const d = settings.quota.default;
  return (
    <Panel id="quota" title="Quotas">
      <p className="hint">
        What each person’s pages may take up, counting every version. Versions share files they do not change, so a small edit costs
        little. Pages count against their owner, whoever edits them. Give someone their own limit under Users. 0 means no limit.
      </p>
      <form
        className="flex flex-col gap-4"
        action={(form) =>
          s.save({
            quota: {
              ...settings.quota,
              default: { storageMB: Number(form.get('storageMB')) || 0, pages: Number(form.get('pages')) || 0 },
            },
          })
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field">
            <span className="label">Storage per person (MB)</span>
            <input name="storageMB" type="number" min={0} step={1} defaultValue={d.storageMB} required />
          </label>
          <label className="field">
            <span className="label">Pages per person</span>
            <input name="pages" type="number" min={0} step={1} defaultValue={d.pages} required />
          </label>
        </div>
        <Message m={s.message} />
        <button className="btn w-fit" data-tone="primary" disabled={s.busy}>
          Save
        </button>
      </form>
    </Panel>
  );
}

export function SiteSettings({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  return (
    <>
      <RegistrationSettings settings={settings} setSettings={setSettings} />
      <EmailSettings settings={settings} setSettings={setSettings} />
      <CdnSettings settings={settings} setSettings={setSettings} />
      <QuotaSettings settings={settings} setSettings={setSettings} />
    </>
  );
}
