'use client';

import { useCallback, useEffect, useState } from 'react';
import type { KeyAccess, KeySummary } from '@/lib/api-keys';

const ACCESS_LABEL: Record<KeyAccess, string> = {
  read: 'Read published pages',
  write: 'Read and write drafts',
  publish: 'Read, write and publish',
};

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');

export function ApiKeys({ allowed, mcpUrl }: { allowed: KeyAccess[]; mcpUrl: string }) {
  const [keys, setKeys] = useState<KeySummary[] | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/keys');
    setKeys(res.ok ? await res.json() : []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function create(form: FormData) {
    setBusy(true);
    setError(null);
    const expires = String(form.get('expires'));
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.get('name'),
        access: form.get('access'),
        expiresInDays: expires === 'never' ? null : Number(expires),
      }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error ?? `HTTP ${res.status}`);
    setCreated(body.key);
    await load();
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this key? Agents using it stop working immediately.')) return;
    await fetch(`/api/keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await load();
  }

  return (
    <section className="flex flex-col gap-5" aria-labelledby="keys">
      <div className="flex flex-col gap-1">
        <h2 id="keys" className="font-display text-[1.65rem]">
          API keys
        </h2>
        <p className="text-muted">
          For agents and MCP clients. Send the key as <code>Authorization: Bearer &lt;key&gt;</code> to{' '}
          <code>{mcpUrl}</code>.
        </p>
      </div>

      {created && (
        <div className="flex flex-col gap-2" role="status">
          <div className="label text-accent">New key: copy it now, it is not shown again</div>
          <div className="secret">{created}</div>
          <button type="button" className="btn w-fit" onClick={() => setCreated(null)}>
            Done
          </button>
        </div>
      )}

      <form action={create} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-end">
        <label className="field">
          <span className="label">Name</span>
          <input name="name" required maxLength={32} placeholder="e.g. laptop-claude" />
        </label>
        <label className="field">
          <span className="label">Access</span>
          <select name="access" defaultValue={allowed[allowed.length - 1]}>
            {allowed.map((a) => (
              <option key={a} value={a}>
                {ACCESS_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">Expires</span>
          <select name="expires" defaultValue="90">
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
            <option value="never">Never</option>
          </select>
        </label>
        <button type="submit" className="btn" data-tone="primary" disabled={busy}>
          Create key
        </button>
      </form>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}

      {keys === null ? (
        <p className="text-muted">Loading…</p>
      ) : keys.length === 0 ? (
        <p className="text-muted">No keys yet.</p>
      ) : (
        <div className="scroll-x">
          <table className="w-full text-[0.92rem]">
            <thead>
              <tr className="label text-left">
                <th className="py-1 pr-4">Name</th>
                <th className="py-1 pr-4">Key</th>
                <th className="py-1 pr-4">Access</th>
                <th className="py-1 pr-4">Last used</th>
                <th className="py-1 pr-4">Expires</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-t border-line">
                  <td className="py-2 pr-4">{k.name}</td>
                  <td className="mono py-2 pr-4">{k.start}…</td>
                  <td className="py-2 pr-4">{k.access.join(', ')}</td>
                  <td className="py-2 pr-4">{date(k.lastUsedAt)}</td>
                  <td className="py-2 pr-4">{k.expiresAt ? date(k.expiresAt) : 'never'}</td>
                  <td className="py-2 text-right">
                    <button type="button" className="btn" data-tone="danger" onClick={() => revoke(k.id)}>
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
