'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { call, jsonInit, uploadPath } from '@/lib/client-fetch';
import { bytes, when } from '@/lib/format';
import { FilePicker } from './FilePicker';

function Status({ error, done }: { error: string | null; done?: string | null }) {
  if (error) {
    return (
      <p role="alert" className="text-[0.92rem] text-danger">
        {error}
      </p>
    );
  }
  return done ? <p className="text-[0.92rem] text-done">{done}</p> : null;
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      setDone((await fn()) ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, done, run };
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="panel scroll-mt-20">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function DetailsForm({ id, title, description }: { id: string; title: string; description: string }) {
  const router = useRouter();
  const a = useAction();
  return (
    <Section id="details" title="Details">
      <form
        className="flex flex-col gap-4"
        action={(form) =>
          a.run(async () => {
            await call(`/api/pages/${id}`, jsonInit('PATCH', { title: form.get('title'), description: form.get('description') }));
            router.refresh();
            return 'Saved.';
          })
        }
      >
        <label className="field">
          <span className="label">Title</span>
          <input name="title" defaultValue={title} required maxLength={200} />
        </label>
        <label className="field">
          <span className="label">Description</span>
          <input name="description" defaultValue={description} maxLength={2000} />
        </label>
        <Status error={a.error} done={a.done} />
        <button className="btn w-fit" disabled={a.busy}>
          Save details
        </button>
      </form>
    </Section>
  );
}

export function FilesEditor({
  id,
  version,
  files,
  indexHtml,
}: {
  id: string;
  version: number;
  files: { path: string; size: number }[];
  /** index.html as text, or null when it is too large to edit here. */
  indexHtml: string | null;
}) {
  const router = useRouter();
  const a = useAction();
  const [uploads, setUploads] = useState<File[]>([]);
  const [prefix, setPrefix] = useState('');
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  function toggle(p: string) {
    const next = new Set(removed);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setRemoved(next);
  }

  return (
    <Section id="files" title="Content">
      <p className="hint">
        Saving makes version {version + 1}. Earlier versions stay in the history. Agents with an API key can also edit it.
      </p>
      <form
        className="flex flex-col gap-4"
        action={(form) =>
          a.run(async () => {
            const body = new FormData();
            body.set('expectedVersion', String(version));
            const html = form.get('html');
            if (indexHtml !== null && typeof html === 'string' && html !== indexHtml) body.set('html', html);
            for (const f of uploads) body.append('files', f, uploadPath(f, prefix));
            for (const p of removed) body.append('delete', p);
            body.set('note', String(form.get('note') ?? ''));
            if (!body.has('html') && uploads.length === 0 && removed.size === 0) throw new Error('Nothing changed.');
            const r = await call<{ version: number }>(`/api/pages/${id}/versions`, { method: 'POST', body });
            setUploads([]);
            setRemoved(new Set());
            router.refresh();
            return `Saved version ${r.version}.`;
          })
        }
      >
        {indexHtml !== null ? (
          <label className="field">
            <span className="label">index.html</span>
            <textarea name="html" rows={16} defaultValue={indexHtml} key={version} spellCheck={false} />
          </label>
        ) : (
          <p className="hint">index.html is too large to edit here; upload a new one instead.</p>
        )}
        <div className="flex flex-col gap-2">
          <span className="label">Files</span>
          <div className="scroll-x">
            <table className="table">
              <tbody>
                {files.map((f) => (
                  <tr key={f.path} className={removed.has(f.path) ? 'line-through opacity-60' : undefined}>
                    <td className="mono text-[0.82rem]">{f.path}</td>
                    <td className="num text-muted">{bytes(f.size)}</td>
                    <td className="text-right">
                      {f.path !== 'index.html' && (
                        <button type="button" className="btn" data-size="small" onClick={() => toggle(f.path)}>
                          {removed.has(f.path) ? 'Keep' : 'Remove'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="label">Add or replace files</span>
          <label className="field max-w-xs">
            <span className="hint">Into folder (optional)</span>
            <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="e.g. assets" />
          </label>
          <FilePicker files={uploads} onChange={setUploads} prefix={prefix} />
        </div>
        <label className="field">
          <span className="label">Note (optional)</span>
          <input name="note" maxLength={500} placeholder="What changed" />
        </label>
        <Status error={a.error} done={a.done} />
        <button className="btn w-fit" data-tone="primary" disabled={a.busy}>
          Save new version
        </button>
      </form>
    </Section>
  );
}

interface Share {
  userId: string;
  name: string;
  email: string;
  access: 'read' | 'write';
}

export function Sharing({ id, initial }: { id: string; initial: Share[] }) {
  const [shares, setShares] = useState(initial);
  const a = useAction();
  const update = (s: Share, access: 'read' | 'write') =>
    a.run(async () => setShares(await call<Share[]>(`/api/pages/${id}/shares`, jsonInit('POST', { email: s.email, access }))));
  const remove = (s: Share) =>
    a.run(async () => setShares(await call<Share[]>(`/api/pages/${id}/shares`, jsonInit('DELETE', { userId: s.userId }))));

  return (
    <Section id="sharing" title="Sharing">
      <p className="hint">Only you and the people listed here can open this page. They need a Hatcher account.</p>
      {shares.length > 0 && (
        <div className="scroll-x">
          <table className="table">
            <tbody>
              {shares.map((s) => (
                <tr key={s.userId}>
                  <td>
                    {s.name && <div>{s.name}</div>}
                    <div className="text-[0.85rem] text-muted">{s.email}</div>
                  </td>
                  <td>
                    <label className="field">
                      <span className="sr-only">Access for {s.email}</span>
                      <select value={s.access} disabled={a.busy} onChange={(e) => update(s, e.target.value as Share['access'])}>
                        <option value="read">Can view</option>
                        <option value="write">Can edit</option>
                      </select>
                    </label>
                  </td>
                  <td className="text-right">
                    <button type="button" className="btn" data-size="small" data-tone="danger" disabled={a.busy} onClick={() => remove(s)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form
        className="flex flex-wrap items-end gap-3"
        action={(form) =>
          a.run(async () => {
            setShares(await call<Share[]>(`/api/pages/${id}/shares`, jsonInit('POST', { email: form.get('email'), access: form.get('access') })));
            return 'Shared.';
          })
        }
      >
        <label className="field min-w-[16rem] flex-1">
          <span className="label">Email</span>
          <input name="email" type="email" required autoComplete="off" />
        </label>
        <label className="field">
          <span className="label">Access</span>
          <select name="access" defaultValue="read">
            <option value="read">Can view</option>
            <option value="write">Can edit</option>
          </select>
        </label>
        <button className="btn" data-tone="primary" disabled={a.busy}>
          Share
        </button>
      </form>
      <Status error={a.error} done={a.done} />
    </Section>
  );
}

export function History({
  id,
  current,
  versions,
  canRestore,
}: {
  id: string;
  current: number;
  versions: { version: number; at: string; note: string | null; author: string; files: number; bytes: number }[];
  canRestore: boolean;
}) {
  const router = useRouter();
  const a = useAction();
  return (
    <Section id="versions" title="History">
      <div className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>Version</th>
              <th>When</th>
              <th>By</th>
              <th>Note</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.version}>
                <td className="num">
                  <Link href={v.version === current ? `/p/${id}` : `/p/${id}?v=${v.version}`}>v{v.version}</Link>
                </td>
                <td className="whitespace-nowrap text-muted">{when(v.at)}</td>
                <td className="text-[0.85rem]">{v.author}</td>
                <td className="text-[0.85rem] text-muted">
                  {v.note}
                  <span className="ml-2 whitespace-nowrap">
                    {v.files} file{v.files === 1 ? '' : 's'}, {bytes(v.bytes)}
                  </span>
                </td>
                <td className="text-right">
                  {canRestore && v.version !== current && (
                    <button
                      type="button"
                      className="btn"
                      data-size="small"
                      disabled={a.busy}
                      onClick={() =>
                        a.run(async () => {
                          const r = await call<{ version: number }>(`/api/pages/${id}/restore`, jsonInit('POST', { version: v.version, expectedVersion: current }));
                          router.refresh();
                          return `Version ${v.version} restored as version ${r.version}.`;
                        })
                      }
                    >
                      Restore
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Status error={a.error} done={a.done} />
    </Section>
  );
}

export function DeletePage({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const a = useAction();
  const [armed, setArmed] = useState(false);
  return (
    <Section id="delete" title="Delete">
      <p className="hint">Deletes the page, every version and every share. This cannot be undone.</p>
      {armed ? (
        <div className="flex flex-wrap items-center gap-3">
          <span>Delete “{title}” for good?</span>
          <button
            type="button"
            className="btn"
            data-tone="danger"
            disabled={a.busy}
            onClick={() =>
              a.run(async () => {
                await call(`/api/pages/${id}`, { method: 'DELETE' });
                router.push('/');
                router.refresh();
              })
            }
          >
            Yes, delete
          </button>
          <button type="button" className="btn" onClick={() => setArmed(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="btn w-fit" data-tone="danger" onClick={() => setArmed(true)}>
          Delete page
        </button>
      )}
      <Status error={a.error} />
    </Section>
  );
}
