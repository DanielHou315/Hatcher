'use client';

import { useCallback, useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { ROLES, type Role } from '@/lib/roles';

interface Row {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned?: boolean | null;
  createdAt: Date | string;
}

export function UserAdmin({ selfId }: { selfId: string }) {
  const [users, setUsers] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await authClient.admin.listUsers({ query: { limit: 200, sortBy: 'createdAt' } });
    if (error) setError(error.message ?? 'Could not load users.');
    setUsers((data?.users as Row[] | undefined) ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: Promise<{ error: { message?: string } | null }>) {
    setError(null);
    const { error } = await action;
    if (error) setError(error.message ?? 'Request failed.');
    await load();
  }

  async function create(form: FormData) {
    const email = String(form.get('email'));
    const password = crypto.getRandomValues(new Uint8Array(18)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
    setCreated(null);
    await run(
      authClient.admin.createUser({
        email,
        password,
        name: String(form.get('name')),
        role: form.get('role') as Role,
      }),
    );
    setCreated(`${email} / ${password}`);
  }

  return (
    <div className="flex flex-col gap-8">
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
      </form>
      {created && (
        <div className="flex flex-col gap-2" role="status">
          <div className="label text-accent">Temporary credentials: share them privately; the user should change the password</div>
          <div className="secret">{created}</div>
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
        <div className="scroll-x">
          <table className="w-full text-[0.92rem]">
            <thead>
              <tr className="label text-left">
                <th className="py-1 pr-4">User</th>
                <th className="py-1 pr-4">Role</th>
                <th className="py-1 pr-4">Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="py-2 pr-4">
                    <div>{u.name}</div>
                    <div className="text-xs text-muted">{u.email}</div>
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      aria-label={`Role of ${u.email}`}
                      value={u.role ?? 'user'}
                      disabled={u.id === selfId}
                      onChange={(e) => run(authClient.admin.setRole({ userId: u.id, role: e.target.value as Role }))}
                      className="border border-line bg-surface px-2 py-1"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="flex justify-end gap-2 py-2">
                    {u.id !== selfId && (
                      <>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => run(u.banned ? authClient.admin.unbanUser({ userId: u.id }) : authClient.admin.banUser({ userId: u.id }))}
                        >
                          {u.banned ? 'Unban' : 'Ban'}
                        </button>
                        <button
                          type="button"
                          className="btn"
                          data-tone="danger"
                          onClick={() => confirm(`Delete ${u.email}?`) && run(authClient.admin.removeUser({ userId: u.id }))}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
