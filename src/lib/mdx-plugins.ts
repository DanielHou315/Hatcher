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
