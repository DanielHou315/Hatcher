// Copy browser libraries that sandboxed pages may load into public/_lib (gitignored).
// Runs before `dev` and `build`; sandboxed code can only load scripts from this server.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'public/_lib');
const katex = path.join(root, 'node_modules/katex/dist');

fs.rmSync(path.join(out, 'katex'), { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'katex/contrib'), { recursive: true });
for (const file of ['katex.min.js', 'katex.min.css']) fs.copyFileSync(path.join(katex, file), path.join(out, 'katex', file));
fs.copyFileSync(path.join(katex, 'contrib/auto-render.min.js'), path.join(out, 'katex/contrib/auto-render.min.js'));
fs.cpSync(path.join(katex, 'fonts'), path.join(out, 'katex/fonts'), { recursive: true });
console.log('vendored katex into public/_lib/katex');
