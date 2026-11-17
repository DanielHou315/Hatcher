// Checks shared by `npm run validate:content` and the MCP write tools: frontmatter (via parseEntry),
// MDX compilation with the safety rules, figure references, and the sandbox's same-host rule.
import { compile } from '@mdx-js/mdx';
import fs from 'node:fs';
import path from 'node:path';
import rehypeKatex from 'rehype-katex';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { Entry, Site } from './content';
import { remarkKnownComponents, remarkSafeMdx } from './mdx-plugins';
import { externalResources, extractHtmlToc, isFigurePath } from './sandbox';

export interface Problems {
  errors: string[];
  warnings: string[];
}

/** Sandboxed HTML may only load from this server; anything else is blocked at runtime. */
function checkHtml(label: string, html: string, out: Problems) {
  for (const url of externalResources(html)) {
    out.errors.push(`${label}: loads ${url} from another host, which the sandbox blocks; copy it into the page folder`);
  }
}

/** Every other .html file in a page folder (figures), labeled relative to the content directory. */
function checkBundleFiles(entry: Entry, out: Problems) {
  if (!entry.bundle) return;
  const folder = path.dirname(entry.file);
  for (const d of fs.readdirSync(folder, { recursive: true, withFileTypes: true })) {
    const file = path.join(d.parentPath, d.name);
    if (d.isFile() && d.name.endsWith('.html') && file !== entry.file) {
      checkHtml(path.join(path.dirname(entry.relPath), path.relative(folder, file)), fs.readFileSync(file, 'utf8'), out);
    }
  }
}

function checkFigures(entry: Entry, out: Problems) {
  for (const m of entry.body.matchAll(/<Figure\b[^>]*?\bsrc\s*=\s*["']([^"']*)["']/g)) {
    const src = m[1];
    if (!entry.bundle) {
      out.errors.push(`${entry.relPath}: <Figure src="${src}"> needs a page folder (<slug>/index.mdx)`);
    } else if (!isFigurePath(src)) {
      out.errors.push(`${entry.relPath}: <Figure src="${src}">: src must be a relative path to an .html file`);
    } else if (!fs.existsSync(path.join(path.dirname(entry.file), src))) {
      out.errors.push(`${entry.relPath}: <Figure src="${src}">: file not found in the page folder`);
    }
  }
}

async function compileMdx(entry: Entry, out: Problems) {
  try {
    const file = await compile(
      { value: entry.body, path: entry.file },
      { remarkPlugins: [remarkGfm, remarkMath, remarkKnownComponents, remarkSafeMdx], rehypePlugins: [rehypeSlug, rehypeKatex] },
    );
    for (const m of file.messages) {
      const line = m.line ? `:${m.line + entry.bodyLineOffset}` : '';
      out.errors.push(`${entry.relPath}${line}: ${m.reason}${m.cause instanceof Error ? ` (${m.cause.message})` : ''}`);
    }
  } catch (err) {
    const e = err as Error & { line?: number; column?: number };
    const where = e.line ? `:${e.line + entry.bodyLineOffset}${e.column ? `:${e.column}` : ''}` : '';
    out.errors.push(`${entry.relPath}${where}: MDX does not compile: ${e.message}`);
  }
}

/** Validate one page. Errors make it unpublishable; warnings are advice. */
export async function validateEntry(entry: Entry): Promise<Problems> {
  const out: Problems = { errors: [], warnings: [] };
  if (entry.error) {
    out.errors.push(entry.error);
    return out;
  }
  checkBundleFiles(entry, out);
  if (entry.format === 'html') {
    checkHtml(entry.relPath, entry.body, out);
    const headings = (entry.body.match(/<h2\b/gi) ?? []).length;
    if (headings > 0 && extractHtmlToc(entry.body).length === 0) {
      out.warnings.push(`${entry.relPath}: no <h2> has an id, so the page has no table of contents`);
    }
    return out;
  }
  checkFigures(entry, out);
  await compileMdx(entry, out);
  return out;
}

/** Cross-page advice: prerequisites and roadmap items that do not exist yet. */
export function siteWarnings(site: Site): string[] {
  const warnings: string[] = [];
  for (const [slug, missing] of site.missingPrerequisites) {
    warnings.push(`${slug}: prerequisites not on the site yet: ${missing.join(', ')}`);
  }
  for (const roadmap of site.roadmaps) {
    const absent = (roadmap.stages ?? []).flatMap((s) => s.items).filter((s) => !site.bySlug.has(s));
    if (absent.length) warnings.push(`${roadmap.slug}: roadmap items not on the site yet: ${absent.join(', ')}`);
  }
  return warnings;
}
