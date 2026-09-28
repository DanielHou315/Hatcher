import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { InlineMath } from '@/lib/inline-math';
import type { Source } from '@/lib/schema';

interface EnvProps {
  name?: string;
  label?: string;
  children?: ReactNode;
}

function Eyebrow({ parts }: { parts: (string | undefined)[] }) {
  const shown = parts.filter((p): p is string => Boolean(p));
  return (
    <div className="env-eyebrow">
      {shown.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="env-sep"> · </span>}
          {i === 0 ? p : <InlineMath text={p} />}
        </span>
      ))}
    </div>
  );
}

function mathEnv(kind: string) {
  function MathEnv({ name, label, children }: EnvProps) {
    return (
      <section className="math-env" data-env={kind.toLowerCase()}>
        <Eyebrow parts={[kind.toUpperCase(), label, name]} />
        <div className="env-body">{children}</div>
      </section>
    );
  }
  MathEnv.displayName = kind;
  return MathEnv;
}

export const Definition = mathEnv('Definition');
export const Theorem = mathEnv('Theorem');
export const Lemma = mathEnv('Lemma');
export const Proposition = mathEnv('Proposition');
export const Corollary = mathEnv('Corollary');

export function Proof({ children }: { children?: ReactNode }) {
  return (
    <details open className="proof">
      <summary>Proof</summary>
      <div className="proof-body">{children}</div>
    </details>
  );
}

export function Example({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <aside className="example">
      <Eyebrow parts={['WORKED EXAMPLE', title]} />
      <div className="env-body">{children}</div>
    </aside>
  );
}

export function Intuition({ children }: { children?: ReactNode }) {
  return (
    <aside className="intuition">
      <div className="env-eyebrow">Intuition</div>
      <div className="env-body">{children}</div>
    </aside>
  );
}

export function Warning({ children }: { children?: ReactNode }) {
  return (
    <aside className="warning" role="note">
      <div className="env-eyebrow">Watch out</div>
      <div className="env-body">{children}</div>
    </aside>
  );
}

export function Exercise({ hint, children }: { hint?: string; children?: ReactNode }) {
  return (
    <section className="exercise">
      <div className="env-eyebrow exercise-label" data-exercise-counter="" />
      <div className="env-body">{children}</div>
      {hint ? (
        <details className="hint">
          <summary>Hint</summary>
          <p>
            <InlineMath text={String(hint)} />
          </p>
        </details>
      ) : null}
    </section>
  );
}

export function makeCite(sources: Source[]) {
  return function Cite({ id }: { id?: string }) {
    const key = String(id ?? '');
    const src = sources.find((s) => s.id === key) ?? sources.find((s) => s.title === key);
    if (!src) {
      return <span className="cite cite-missing" title="Not listed in this page's sources">[{key}]</span>;
    }
    const href = src.type === 'arxiv' && src.id ? `https://arxiv.org/abs/${src.id}` : src.url;
    const label = (
      <>
        {src.title}
        {src.type === 'arxiv' && src.id ? <span className="cite-id">arXiv:{src.id}</span> : null}
      </>
    );
    return href ? (
      <a className="cite" href={href} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    ) : (
      <cite className="cite">{label}</cite>
    );
  };
}

// Plain element overrides

function A({ href = '', children, ...rest }: ComponentPropsWithoutRef<'a'>) {
  if (href.startsWith('/')) {
    return (
      <Link href={href} {...rest}>
        {children}
      </Link>
    );
  }
  if (href.startsWith('#')) return <a href={href} {...rest}>{children}</a>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  );
}

function Table(props: ComponentPropsWithoutRef<'table'>) {
  return (
    <div className="scroll-x">
      <table {...props} />
    </div>
  );
}

function Pre(props: ComponentPropsWithoutRef<'pre'>) {
  return (
    <div className="scroll-x code-block">
      <pre {...props} />
    </div>
  );
}

export function mdxComponents(sources: Source[]) {
  return {
    Definition,
    Theorem,
    Lemma,
    Proposition,
    Corollary,
    Proof,
    Example,
    Intuition,
    Warning,
    Exercise,
    Cite: makeCite(sources),
    a: A,
    table: Table,
    pre: Pre,
  };
}
