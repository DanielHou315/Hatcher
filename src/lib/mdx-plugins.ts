// Unified plugins shared by the renderer and the content validator.

export const MDX_COMPONENT_NAMES = [
  'Definition',
  'Theorem',
  'Lemma',
  'Proposition',
  'Corollary',
  'Proof',
  'Example',
  'Intuition',
  'Warning',
  'Exercise',
  'Cite',
  'Figure',
] as const;

interface Node {
  type: string;
  name?: string | null;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
  position?: { start?: { line?: number } };
}

function walk(node: Node, visit: (n: Node) => void) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

/**
 * Fail compilation when MDX uses a capitalized component the site does not provide,
 * instead of throwing later during render.
 */
export function remarkKnownComponents() {
  const known = new Set<string>(MDX_COMPONENT_NAMES);
  return (tree: Node) => {
    walk(tree, (n) => {
      if ((n.type === 'mdxJsxFlowElement' || n.type === 'mdxJsxTextElement') && n.name) {
        if (/^[A-Z]/.test(n.name) || n.name.includes('.')) {
          if (!known.has(n.name)) {
            const line = n.position?.start?.line;
            throw new Error(
              `Unknown component <${n.name}>${line ? ` on line ${line}` : ''}. Available: ${MDX_COMPONENT_NAMES.join(', ')}.`,
            );
          }
        }
      }
    });
  };
}

export interface TocItem {
  depth: 2 | 3;
  id: string;
  text: string;
}

function textOf(node: Node): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

/** Collect h2/h3 headings (after rehype-slug has assigned ids) into `out`. */
export function rehypeCollectToc(out: TocItem[]) {
  return () => (tree: Node) => {
    walk(tree, (n) => {
      if (n.type === 'element' && (n.tagName === 'h2' || n.tagName === 'h3')) {
        const id = n.properties?.id;
        if (typeof id === 'string') {
          out.push({ depth: n.tagName === 'h2' ? 2 : 3, id, text: textOf(n).trim() });
        }
      }
    });
  };
}

/** Plain HTML elements MDX pages may use. Anything that runs code, loads a document, or submits is excluded. */
export const MDX_HTML_ELEMENTS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'details',
  'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img',
  'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'summary',
  'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul', 'var', 'wbr',
]);

const URL_ATTRIBUTES = new Set(['href', 'src', 'srcset', 'cite', 'poster', 'action', 'formaction', 'background', 'xlink:href']);
/** Relative URLs, fragments, and http(s)/mailto. Rejects javascript:, data:, vbscript: and the like. */
const SAFE_URL = /^(?:[^:/?#]+(?:[/?#]|$)|[/?#.]|https?:|mailto:)/i;

interface JsxAttribute {
  type: string;
  name?: string;
  value?: string | { type: string } | null;
}

/**
 * MDX pages render in the site's own origin, so they must not run code: no imports/exports, no
 * {expressions}, and plain HTML limited to inert prose elements with no event handlers or
 * script URLs. Interactive code belongs in a sandboxed <Figure> or an HTML page.
 */
export function remarkSafeMdx() {
  return (tree: Node) => {
    walk(tree, (n) => {
      const line = n.position?.start?.line;
      const at = line ? ` on line ${line}` : '';
      const fail = (what: string): never => {
        throw new Error(`${what}${at} is not allowed in MDX. Put interactive code in a <Figure> or an HTML page.`);
      };
      if (n.type === 'mdxjsEsm') fail('import/export');
      if (n.type === 'mdxFlowExpression' || n.type === 'mdxTextExpression') fail('A {JavaScript expression}');
      if (n.type !== 'mdxJsxFlowElement' && n.type !== 'mdxJsxTextElement') return;
      if (!n.name) fail('A fragment <>');
      const name = n.name!;
      if (/^[a-z]/.test(name) && !MDX_HTML_ELEMENTS.has(name)) fail(`<${name}>`);
      for (const attr of ((n as { attributes?: JsxAttribute[] }).attributes ?? [])) {
        if (attr.type !== 'mdxJsxAttribute') fail(`A spread attribute on <${name}>`);
        const attrName = (attr.name ?? '').toLowerCase();
        if (attr.value && typeof attr.value === 'object') fail(`An expression attribute ${attr.name}={...} on <${name}>`);
        if (attrName.startsWith('on') || attrName === 'srcdoc' || attrName === 'dangerouslysetinnerhtml') fail(`The ${attr.name} attribute`);
        if (URL_ATTRIBUTES.has(attrName) && typeof attr.value === 'string') {
          const urls = attrName === 'srcset' ? attr.value.split(',').map((s) => s.trim().split(/\s+/)[0]) : [attr.value.trim()];
          for (const url of urls) if (url && !SAFE_URL.test(url)) fail(`The URL ${JSON.stringify(url)} in ${attr.name}`);
        }
      }
    });
  };
}
