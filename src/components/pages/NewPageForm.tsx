'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call, uploadPath } from '@/lib/client-fetch';
import { FilePicker } from './FilePicker';

const STARTER = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>My page</title>
</head>
<body>
  <h1>Hello</h1>
</body>
</html>
`;

export function NewPageForm() {
  const router = useRouter();
  const [mode, setMode] = useState<'paste' | 'upload'>('paste');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.set('title', String(form.get('title') ?? ''));
    body.set('description', String(form.get('description') ?? ''));
    if (mode === 'paste') body.set('html', String(form.get('html') ?? ''));
    else for (const f of files) body.append('files', f, uploadPath(f));
    try {
      const { id } = await call<{ id: string }>('/api/pages', { method: 'POST', body });
      router.push(`/p/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form action={submit} className="flex flex-col gap-5">
      <label className="field">
        <span className="label">Title</span>
        <input name="title" required maxLength={200} />
      </label>
      <label className="field">
        <span className="label">Description (optional)</span>
        <input name="description" maxLength={2000} />
      </label>
      <div className="segmented w-fit" role="group" aria-label="Content">
        <button type="button" aria-pressed={mode === 'paste'} onClick={() => setMode('paste')}>
          Paste HTML
        </button>
        <button type="button" aria-pressed={mode === 'upload'} onClick={() => setMode('upload')}>
          Upload files
        </button>
      </div>
      {mode === 'paste' ? (
        <label className="field">
          <span className="label">index.html</span>
          <textarea name="html" rows={18} defaultValue={STARTER} spellCheck={false} required />
        </label>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="hint">
            Upload index.html and anything it uses (scripts, styles, images, data). A folder keeps its structure; its top folder is dropped if
            index.html is inside it.
          </p>
          <FilePicker files={files} onChange={setFiles} />
        </div>
      )}
      {error && (
        <p role="alert" className="text-[0.92rem] text-danger">
          {error}
        </p>
      )}
      <button type="submit" className="btn w-fit" data-tone="primary" disabled={busy || (mode === 'upload' && files.length === 0)}>
        Create page
      </button>
    </form>
  );
}
