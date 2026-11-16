// Parse and compile every content file; print problems; exit 1 on any error.
// Usage: npm run validate:content [-- <content dir>]
import { compile } from '@mdx-js/mdx';
import rehypeKatex from 'rehype-katex';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { buildSite, contentDir, loadEntries } from '../src/lib/content';
import { remarkKnownComponents } from '../src/lib/mdx-plugins';

const dir = process.argv[2] ?? contentDir();
const entries = loadEntries(dir);
const site = buildSite(entries);
const errors: string[] = [];
const warnings: string[] = [];

for (const entry of entries) {
  if (entry.error) {
    errors.push(entry.error);
    continue;
  }
  try {
    const file = await compile(
      { value: entry.body, path: entry.file },
      {
        remarkPlugins: [remarkGfm, remarkMath, remarkKnownComponents],
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
