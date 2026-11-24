'use client';

import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';

type Step =
  | { kind: 'idle' }
  | { kind: 'password'; action: 'enable' | 'disable' | 'codes' }
  | { kind: 'scan'; uri: string; secret: string; backupCodes: string[] }
  | { kind: 'codes'; backupCodes: string[] };

function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-3" role="status">
      <p>
        <strong>Save these backup codes</strong> somewhere safe, like a password manager. Each signs you in once if you lose your phone. They are
        not shown again.
      </p>
      <ul className="secret grid grid-cols-2 gap-1 sm:grid-cols-5">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <button type="button" className="btn w-fit" onClick={onDone}>
        I saved them
      </button>
    </div>
  );
}

function Qr({ uri }: { uri: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    QRCode.toString(uri, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }).then(setSvg, () => setSvg(''));
  }, [uri]);
  return <div className="qr" role="img" aria-label="QR code for your authenticator app" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function TwoFactorSettings({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function withPassword(form: FormData) {
    if (step.kind !== 'password') return;
    setBusy(true);
    setError(null);
    const password = String(form.get('password') ?? '');
    if (step.action === 'enable') {
      const { data, error } = await authClient.twoFactor.enable({ password });
      setBusy(false);
      if (error || !data || data.method !== 'totp') return setError(error?.message ?? 'Could not start setup.');
      const secret = new URL(data.totpURI).searchParams.get('secret') ?? '';
      setStep({ kind: 'scan', uri: data.totpURI, secret, backupCodes: data.backupCodes });
    } else if (step.action === 'disable') {
      const { error } = await authClient.twoFactor.disable({ password });
      setBusy(false);
      if (error) return setError(error.message ?? 'Could not turn it off.');
      setStep({ kind: 'idle' });
      router.refresh();
    } else {
      const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
      setBusy(false);
      if (error || !data) return setError(error?.message ?? 'Could not make new codes.');
      setStep({ kind: 'codes', backupCodes: data.backupCodes });
    }
  }

  async function verify(form: FormData) {
    if (step.kind !== 'scan') return;
    setBusy(true);
    setError(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code: String(form.get('code') ?? '').replace(/\s+/g, '') });
    setBusy(false);
    if (error) return setError(error.message ?? 'That code did not work. Check the time on your phone and try the next code.');
    setStep({ kind: 'codes', backupCodes: step.backupCodes });
  }

  return (
    <section className="panel" aria-labelledby="two-factor">
      <h2 id="two-factor" className="flex items-center gap-3">
        Two-factor sign-in
        <span className="pill" data-tone={enabled ? 'ok' : undefined}>
          {enabled ? 'on' : 'off'}
        </span>
      </h2>
      <p className="hint">
        After your password, sign-in asks for a six-digit code from an authenticator app (1Password, Bitwarden, Google Authenticator, Aegis…).
      </p>

      {step.kind === 'idle' &&
        (enabled ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => setStep({ kind: 'password', action: 'codes' })}>
              New backup codes
            </button>
            <button type="button" className="btn" data-tone="danger" onClick={() => setStep({ kind: 'password', action: 'disable' })}>
              Turn off
            </button>
          </div>
        ) : (
          <button type="button" className="btn w-fit" data-tone="primary" onClick={() => setStep({ kind: 'password', action: 'enable' })}>
            Turn on
          </button>
        ))}

      {step.kind === 'password' && (
        <form action={withPassword} className="flex flex-wrap items-end gap-3">
          <label className="field min-w-[14rem] flex-1">
            <span className="label">Confirm with your password</span>
            <input name="password" type="password" required autoFocus autoComplete="current-password" />
          </label>
          <button className="btn" data-tone="primary" disabled={busy}>
            Continue
          </button>
          <button type="button" className="btn" onClick={() => setStep({ kind: 'idle' })}>
            Cancel
          </button>
        </form>
      )}

      {step.kind === 'scan' && (
        <div className="flex flex-col gap-4">
          <p>Scan this with your authenticator app, then enter the code it shows.</p>
          <Qr uri={step.uri} />
          <details>
            <summary className="cursor-pointer text-[0.9rem] text-muted">Can’t scan? Enter the key by hand</summary>
            <div className="secret mt-2">{step.secret}</div>
          </details>
          <form action={verify} className="flex flex-wrap items-end gap-3">
            <label className="field">
              <span className="label">Code</span>
              <input name="code" required autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" />
            </label>
            <button className="btn" data-tone="primary" disabled={busy}>
              Turn on
            </button>
          </form>
        </div>
      )}

      {step.kind === 'codes' && (
        <BackupCodes
          codes={step.backupCodes}
          onDone={() => {
            setStep({ kind: 'idle' });
            router.refresh();
          }}
        />
      )}

      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
