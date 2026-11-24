'use client';

import { bytes } from '@/lib/format';
import { uploadPath } from '@/lib/client-fetch';

/** Pick files or a whole folder. Shows what will be uploaded and under which paths. */
export function FilePicker({ files, onChange, prefix = '' }: { files: File[]; onChange: (files: File[]) => void; prefix?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <label className="btn" data-size="small">
          Choose files
          <input type="file" multiple className="sr-only" onChange={(e) => onChange([...files, ...Array.from(e.target.files ?? [])])} />
        </label>
        <label className="btn" data-size="small">
          Choose a folder
          <input
            type="file"
            className="sr-only"
            // Folder upload: every file keeps its path inside the chosen folder.
            {...({ webkitdirectory: '', directory: '' } as object)}
            onChange={(e) => onChange([...files, ...Array.from(e.target.files ?? [])])}
          />
        </label>
        {files.length > 0 && (
          <button type="button" className="btn" data-size="small" onClick={() => onChange([])}>
            Clear
          </button>
        )}
      </div>
      {files.length > 0 && (
        <ul className="mono text-[0.8rem] text-muted">
          {files.map((f, i) => (
            <li key={i}>
              {uploadPath(f, prefix)} · {bytes(f.size)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
