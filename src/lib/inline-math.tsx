import katex from 'katex';
import { Fragment, type ReactNode } from 'react';

/** Render a plain string that may contain $...$ inline math (used for component props). */
export function InlineMath({ text }: { text: string }): ReactNode {
  const parts = text.split(/(\$[^$]+\$)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.length > 2 && part.startsWith('$') && part.endsWith('$')) {
      const html = katex.renderToString(part.slice(1, -1), { throwOnError: false, strict: 'ignore' });
      return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
