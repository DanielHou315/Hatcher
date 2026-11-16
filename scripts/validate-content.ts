// Parse and compile every content file; print problems; exit 1 on any error.
// Usage: npm run validate:content [-- <content dir>]
import { compile } from '@mdx-js/mdx';
import rehypeKatex from 'rehype-katex';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import fs from 'node:fs';
import path from 'node:path';
import { buildSite, contentDir, loadEntries, type Entry } from '../src/lib/content';
import { externalResources, extractHtmlToc, isFigurePath } from '../src/lib/sandbox';
import { remarkKnownComponents, remarkSafeMdx } from '../src/lib/mdx-plugins';

const dir = process.argv[2] ?? contentDir();
const entries = loadEntries(dir);
const site = buildSite(entries);
const errors: string[] = [];
const warnings: string[] = [];

/** Sandboxed HTML may only load from this server; anything else is blocked at runtime. */
function checkHtml(relPath: string, html: string) {
  for (const url of externalResources(html)) {
    errors.push(`${relPath}: loads ${url} from another host, which the sandbox blocks; copy it into the page folder`);
  }
}

function checkHtmlEntry(entry: Entry) {
  checkHtml(entry.relPath, entry.body);
  const ids = extractHtmlToc(entry.body).length;
  const headings = (entry.body.match(/<h2\b/gi) ?? []).length;
  if (headings > 0 && ids === 0) warnings.push(`${entry.relPath}: no <h2> has an id, so the page has no table of contents`);
}

function checkBundleFiles(entry: Entry) {
  if (!entry.bundle) return;
  const folder = path.dirname(entry.file);
  for (const d of fs.readdirSync(folder, { recursive: true, withFileTypes: true })) {
    const file = path.join(d.parentPath, d.name);
    if (d.isFile() && d.name.endsWith('.html') && file !== entry.file) {
      checkHtml(path.relative(dir, file), fs.readFileSync(file, 'utf8'));
    }
  }
}

function checkFigures(entry: Entry) {
  for (const m of entry.body.matchAll(/<Figure\b[^>]*?\bsrc\s*=\s*["']([^"']*)["']/g)) {
    const src = m[1];
    if (!entry.bundle) {
      errors.push(`${entry.relPath}: <Figure src="${src}"> needs a page folder (<slug>/index.mdx)`);
    } else if (!isFigurePath(src)) {
      errors.push(`${entry.relPath}: <Figure src="${src}">: src must be a relative path to an .html file`);
    } else if (!fs.existsSync(path.join(path.dirname(entry.file), src))) {
      errors.push(`${entry.relPath}: <Figure src="${src}">: file not found in the page folder`);
    }
  }
}

for (const entry of entries) {
  if (entry.error) {
    errors.push(entry.error);
    continue;
  }
  checkBundleFiles(entry);
  if (entry.format === 'html') {
    checkHtmlEntry(entry);
    continue;
  }
  checkFigures(entry);
  try {
    const file = await compile(
      { value: entry.body, path: entry.file },
      {
        remarkPlugins: [remarkGfm, remarkMath, remarkKnownComponents, remarkSafeMdx],
        rehypePlugins: [rehypeSlug, rehypeKatex],
      },
    );
    for (const m of file.messages) {
      const line = m.line ? `:${m.line + entry.bodyLineOffset}` : '';
      errors.push(`${entry.relPath}${line}: ${m.reason}${m.cause instanceof Error ? ` (${m.cause.message})` : ''}`);
    }
  } catch (err) {
    const e = err as Error & { line?: number; column?: number };
    const where = e.line ? `:${e.line + entry.bodyLineOffset}${e.column ? `:${e.column}` : ''}` : '';
    errors.push(`${entry.relPath}${where}: MDX does not compile: ${e.message}`);
  }
}

for (const [slug, missing] of site.missingPrerequisites) {
  warnings.push(`${slug}: prerequisites not on the site yet: ${missing.join(', ')}`);
}
for (const roadmap of site.roadmaps) {
  const absent = (roadmap.stages ?? []).flatMap((s) => s.items).filter((s) => !site.bySlug.has(s));
  if (absent.length) warnings.push(`${roadmap.slug}: roadmap items not on the site yet: ${absent.join(', ')}`);
}

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
console.log(`${entries.length} files checked in ${dir}: ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
