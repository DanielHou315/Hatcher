'use client';

import { useCallback, useEffect, useState } from 'react';
import { ROLES, type Role } from '@/lib/access';
import { authClient } from '@/lib/auth-client';

interface Row {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned?: boolean | null;
  emailVerified?: boolean | null;
  twoFactorEnabled?: boolean | null;
  createdAt: Date | string;
}

function randomPassword(): string {
  return crypto.getRandomValues(new Uint8Array(15)).reduce((s, b) => s + b.toString(36).padStart(2, '0'), '');
}

export function UserAdmin({ selfId, canEmail, verification }: { selfId: string; canEmail: boolean; verification: boolean }) {
  const [users, setUsers] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; secret?: string } | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await authClient.admin.listUsers({ query: { limit: 500, sortBy: 'createdAt', sortDirection: 'desc' } });
    if (error) setError(error.message ?? 'Could not load users.');
    setUsers((data?.users as Row[] | undefined) ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: Promise<{ error: { message?: string } | null }>, done?: string) {
    setError(null);
    setNotice(null);
    const { error } = await action;
    if (error) setError(error.message ?? 'Request failed.');
    else if (done) setNotice({ text: done });
    await load();
    return !error;
  }

  const sendReset = (email: string) =>
    run(authClient.requestPasswordReset({ email, redirectTo: `${location.origin}/reset-password` }), `Sent ${email} a link to set a password.`);

  async function create(form: FormData) {
    const email = String(form.get('email'));
    const password = randomPassword();
    const ok = await run(authClient.admin.createUser({ email, password, name: String(form.get('name')), role: form.get('role') as Role }));
    if (!ok) return;
    if (canEmail && form.get('invite') === 'on') await sendReset(email);
    else setNotice({ text: 'Account created. Share this temporary password privately; they should change it under Account.', secret: `${email} / ${password}` });
  }

  async function setPassword(u: Row) {
    const password = randomPassword();
    if (await run(authClient.admin.setUserPassword({ userId: u.id, newPassword: password }))) {
      await authClient.admin.revokeUserSessions({ userId: u.id });
      setNotice({ text: `New temporary password for ${u.email}; their other sessions were signed out.`, secret: password });
    }
  }

  const shown = (users ?? []).filter((u) => !query || `${u.name} ${u.email}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex flex-col gap-6">
      <form action={create} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-end">
        <label className="field">
          <span className="label">Name</span>
          <input name="name" required />
        </label>
        <label className="field">
          <span className="label">Email</span>
          <input name="email" type="email" required />
        </label>
        <label className="field">
          <span className="label">Role</span>
          <select name="role" defaultValue="user">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn" data-tone="primary">
          Add user
        </button>
        {canEmail && (
          <label className="check sm:col-span-4">
            <input type="checkbox" name="invite" defaultChecked />
            <span>Email them a link to choose their password (otherwise you get a temporary password to pass on)</span>
          </label>
        )}
      </form>
      {notice && (
        <div className="flex flex-col gap-2" role="status">
          <div className="text-done">{notice.text}</div>
          {notice.secret && <div className="secret">{notice.secret}</div>}
        </div>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {users === null ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-muted">
              {users.length} account{users.length === 1 ? '' : 's'}
            </span>
            <label className="field ml-auto w-full max-w-xs">
              <span className="sr-only">Find</span>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find by name or email" />
            </label>
          </div>
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div>{u.name}</div>
                      <div className="text-xs text-muted">{u.email}</div>
                    </td>
                    <td>
                      <label className="field">
                        <span className="sr-only">Role of {u.email}</span>
                        <select
                          value={u.role === 'admin' ? 'admin' : 'user'}
                          disabled={u.id === selfId}
                          onChange={(e) => run(authClient.admin.setRole({ userId: u.id, role: e.target.value as Role }))}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </label>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {u.banned && <span className="pill" data-tone="danger">suspended</span>}
                        {verification && !u.emailVerified && <span className="pill">unconfirmed</span>}
                        {u.twoFactorEnabled && <span className="pill" data-tone="ok">2FA</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td>
                      {u.id !== selfId && (
                        <div className="flex flex-wrap justify-end gap-2">
                          {canEmail ? (
                            <button type="button" className="btn" data-size="small" onClick={() => sendReset(u.email)}>
                              Send reset link
                            </button>
                          ) : (
                            <button type="button" className="btn" data-size="small" onClick={() => setPassword(u)}>
                              New password
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn"
                            data-size="small"
                            onClick={() =>
                              run(u.banned ? authClient.admin.unbanUser({ userId: u.id }) : authClient.admin.banUser({ userId: u.id }))
                            }
                          >
                            {u.banned ? 'Restore' : 'Suspend'}
                          </button>
                          <button
                            type="button"
                            className="btn"
                            data-size="small"
                            data-tone="danger"
                            onClick={() =>
                              confirm(`Delete ${u.email}? Their pages are deleted too.`) && run(authClient.admin.removeUser({ userId: u.id }))
                            }
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
