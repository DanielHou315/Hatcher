import { compile } from '@mdx-js/mdx';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { describe, expect, it } from 'vitest';
import { remarkKnownComponents, remarkSafeMdx } from '@/lib/mdx-plugins';

const check = (source: string) => compile(source, { remarkPlugins: [remarkGfm, remarkMath, remarkKnownComponents, remarkSafeMdx] });

describe('MDX safety', () => {
  it('allows prose, math, components and inert HTML', async () => {
    await expect(
      check(
        [
          '# Title',
          'Inline $a<b$ and $\\{x\\}$, with `{code}`.',
          '$$\n\\sum_{i} x_i\n$$',
          '<Theorem title="Main">Body</Theorem>',
          '<details><summary>More</summary><sub>2</sub> <a href="/concepts/x#y">link</a> <a href="https://e.org">ext</a></details>',
          '<img src="figures/a.png" alt="a" />',
          '```js\nimport x from "y"; {1+1}\n```',
        ].join('\n\n'),
      ),
    ).resolves.toBeTruthy();
  });

  it.each([
    ['imports', 'import x from "y"'],
    ['exports', 'export const a = 1'],
    ['flow expressions', '{1 + 1}'],
    ['inline expressions', 'Text {globalThis.process} here'],
    ['script tags', '<script>alert(1)</script>'],
    ['style tags', '<style>{"body{}"}</style>'],
    ['iframes', '<iframe src="https://e.org"></iframe>'],
    ['forms', '<form action="/x"><button>go</button></form>'],
    ['svg', '<svg><a href="#">x</a></svg>'],
    ['event handlers', '<img src="a.png" onError="alert(1)" />'],
    ['srcdoc', '<div srcDoc="x" />'],
    ['javascript URLs', '<a href="javascript:alert(1)">x</a>'],
    ['javascript URLs with spacing', '<a href=" JavaScript:alert(1)">x</a>'],
    ['data URLs', '<img src="data:image/svg+xml,<svg onload=alert(1)>" />'],
    ['expression attributes', '<a href={"x"}>x</a>'],
    ['spread attributes', '<div {...props} />'],
    ['fragments', '<>x</>'],
  ])('rejects %s', async (_name, source) => {
    await expect(check(source)).rejects.toThrow(/not allowed in MDX/);
  });
});
