'use client';

/** fetch, then the JSON body, throwing the server's `error` message on failure. */
export async function call<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const body = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new Error(body.error ?? `request failed (${r.status})`);
  return body as T;
}

export const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** Path of an uploaded file inside the page: its folder-relative path when a folder was picked. */
export function uploadPath(file: File, prefix = ''): string {
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  const clean = prefix.trim().replace(/^\/+|\/+$/g, '');
  return clean ? `${clean}/${rel}` : rel;
}
