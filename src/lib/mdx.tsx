import 'server-only';
import { compile } from '@mdx-js/mdx';
import { compileMDX } from 'next-mdx-remote/rsc';
import type { ReactElement } from 'react';
import rehypeKatex from 'rehype-katex';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { mdxComponents, type FigureContext } from '@/components/mdx-components';
import { rehypeCollectToc, remarkKnownComponents, type TocItem } from './mdx-plugins';
import type { Source } from './schema';

export type { TocItem };

export interface RenderedMdx {
  content: ReactElement | null;
  toc: TocItem[];
  error?: string;
}

export async function renderMdx(source: string, opts: { sources: Source[]; file: string; lineOffset?: number; figures: FigureContext }): Promise<RenderedMdx> {
  const toc: TocItem[] = [];
  try {
    const { content } = await compileMDX({
      source,
      components: mdxComponents(opts.sources, opts.figures),
      options: {
        mdxOptions: {
          remarkPlugins: [remarkGfm, remarkMath, remarkKnownComponents],
          rehypePlugins: [rehypeSlug, rehypeCollectToc(toc), rehypeKatex],
        },
      },
    });
    return { content, toc };
  } catch (err) {
    const where = await locateError(source, opts.lineOffset ?? 0);
    return { content: null, toc: [], error: `${opts.file}${where}: ${(err as Error).message}` };
  }
}

/** Recompile with the bare MDX compiler to recover a line:column for the failure. */
async function locateError(source: string, lineOffset: number): Promise<string> {
  try {
    await compile(source, { remarkPlugins: [remarkGfm, remarkMath, remarkKnownComponents] });
  } catch (err) {
    const e = err as { line?: number; column?: number };
    if (e.line) return `:${e.line + lineOffset}${e.column ? `:${e.column}` : ''}`;
  }
  return '';
}
