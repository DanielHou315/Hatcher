import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { findEntry, type Entry, type Site } from '@/lib/content';
import { progressLookup } from '@/lib/db';
import { contentTokenFor, viewerSite } from '@/lib/viewer';
import { renderMdx, type RenderedMdx, type TocItem } from '@/lib/mdx';
import { entryContentBase, entryVersion, extractHtmlToc, FRAME_SANDBOX } from '@/lib/sandbox';
import type { Source } from '@/lib/schema';
import { entryHref, type Kind, type ProgressStatus } from '@/lib/kinds';
import { EntryMeta } from './EntryCard';
import { ProgressControl, ViewLogger } from './ProgressControl';
import { SandboxFrame } from './SandboxFrame';
import { ProgressBar, StatusDot } from './StatusDot';

type StatusOf = (slug: string) => ProgressStatus;

export async function entryMetadata(kind: Kind, slug: string): Promise<Metadata> {
  const { site } = await viewerSite();
  const entry = findEntry(site, kind, slug);
  return entry ? { title: entry.title, description: entry.summary || undefined } : { title: 'Not found' };
}

export async function EntryPage({ kind, slug }: { kind: Kind; slug: string }) {
  const { viewer, site } = await viewerSite();
  const entry = findEntry(site, kind, slug);
  if (!entry) notFound();
  const statusOf = progressLookup(viewer?.id);

  if (entry.error) return <InvalidEntry entry={entry} />;

  const rendered = await renderBody(entry);
  const trackable = entry.kind !== 'roadmap' && viewer !== null;

  return (
    <div className="article-grid">
      <header className="article-head flex flex-col gap-3">
        {entry.status === 'draft' && (
          <span className="pill w-fit" data-tone="draft">
            draft
          </span>
        )}
        <h1 className="title text-[2.1rem] sm:text-[2.6rem]">{entry.title}</h1>
        {entry.summary && <p className="entry-intro measure text-[1.12rem]">{entry.summary}</p>}
        <EntryMeta entry={entry} />
        {entry.prerequisites.length > 0 && <Prerequisites entry={entry} site={site} statusOf={statusOf} />}
        {entry.paper && <PaperMeta entry={entry} />}
      </header>

      <aside className="rail flex flex-col gap-6" aria-label="Contents">
        {rendered.toc.length > 0 && <Toc items={rendered.toc} />}
        {trackable && <ProgressControl slug={entry.slug} initial={statusOf(entry.slug)} />}
      </aside>

      <div className="article-body flex flex-col gap-10">
        {rendered.error ? (
          <div className="error-panel measure flex flex-col gap-2" role="alert">
            <div className="eyebrow text-danger">This page could not be rendered</div>
            <pre className="mono">{rendered.error}</pre>
          </div>
        ) : (
          <div className={entry.format === 'html' ? 'html-page' : 'prose'}>{rendered.content}</div>
        )}
        {entry.stages && <Stages entry={entry} site={site} statusOf={statusOf} />}
        {entry.sources.length > 0 && <Sources sources={entry.sources} />}
        <LeadsTo entry={entry} site={site} statusOf={statusOf} />
        <PrevNext entry={entry} site={site} />
      </div>
      {trackable && <ViewLogger slug={entry.slug} />}
    </div>
  );
}

/** MDX renders in the page; HTML renders in a sandboxed frame, with its headings in the table of contents. */
async function renderBody(entry: Entry): Promise<RenderedMdx> {
  const base = entryContentBase(entry, contentTokenFor(entry));
  const version = entryVersion(entry);
  if (entry.format === 'html') {
    return {
      content: (
        <SandboxFrame src={`${base}index.html?v=${version}`} title={entry.title} sandbox={FRAME_SANDBOX} initialHeight={800} page />
      ),
      toc: extractHtmlToc(entry.body),
    };
  }
  return renderMdx(entry.body, {
    sources: entry.sources,
    file: entry.relPath,
    lineOffset: entry.bodyLineOffset,
    figures: { base: entry.bundle ? base : undefined, version, sandbox: FRAME_SANDBOX },
  });
}

function InvalidEntry({ entry }: { entry: Entry }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="eyebrow">{entry.kind}</span>
        <span className="pill" data-tone="invalid">invalid</span>
      </div>
      <h1 className="title text-[2.1rem]">{entry.title}</h1>
      <div className="error-panel measure flex flex-col gap-3" role="alert">
        <div className="eyebrow text-danger">Frontmatter did not validate</div>
        <pre className="mono">{entry.error}</pre>
        <div className="eyebrow">Raw frontmatter</div>
        <div className="scroll-x">
          <pre className="mono">{entry.rawFrontmatter || '(none)'}</pre>
        </div>
      </div>
    </div>
  );
}

function PageLink({ slug, site, statusOf }: { slug: string; site: Site; statusOf: StatusOf }) {
  const target = site.bySlug.get(slug);
  if (!target) {
    return (
      <span className="inline-flex items-center gap-2 text-muted" title="Referenced but not on the site yet">
        <StatusDot status="missing" />
        <span className="mono text-sm">{slug}</span>
        <span className="pill" data-tone="invalid">missing</span>
      </span>
    );
  }
  return (
    <Link href={entryHref(target.kind, target.slug)} className="inline-flex items-center gap-2 no-underline hover:underline">
      <StatusDot status={statusOf(target.slug)} />
      <span>{target.title}</span>
    </Link>
  );
}

function Prerequisites({ entry, site, statusOf }: { entry: Entry; site: Site; statusOf: StatusOf }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-3">
      <div className="label">Prerequisites</div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
        {entry.prerequisites.map((slug) => (
          <li key={slug}>
            <PageLink slug={slug} site={site} statusOf={statusOf} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PaperMeta({ entry }: { entry: Entry }) {
  const p = entry.paper!;
  const rows: [string, React.ReactNode][] = [];
  if (p.authors.length) rows.push(['Authors', p.authors.join(', ')]);
  if (p.venue || p.year) rows.push(['Venue', [p.venue, p.year && !p.venue?.includes(String(p.year)) ? p.year : null].filter(Boolean).join(', ')]);
  if (p.recognition.length) rows.push(['Recognition', p.recognition.join(' · ')]);
  if (p.arxiv_id)
    rows.push([
      'arXiv',
      <a key="a" href={`https://arxiv.org/abs/${p.arxiv_id}`} target="_blank" rel="noopener noreferrer" className="mono">
        {p.arxiv_id}
      </a>,
    ]);
  if (p.theorems !== undefined) rows.push(['Results', <span key="t" className="num">{p.theorems}</span>]);
  return (
    <div className="measure flex flex-col gap-3 border-t border-line pt-3">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1 text-[0.95rem]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="label pt-[0.2rem]">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {p.why_it_matters && (
        <p className="bg-accent-soft px-4 py-3">
          <span className="label block text-accent">Why it matters</span>
          {p.why_it_matters}
        </p>
      )}
    </div>
  );
}

function Toc({ items }: { items: TocItem[] }) {
  return (
    <nav className="toc flex flex-col gap-1.5" aria-label="On this page">
      <div className="label">On this page</div>
      <ol className="text-[0.88rem]">
        {items.map((item) => (
          <li key={item.id} data-depth={item.depth} className={item.depth === 3 ? 'pl-3' : ''}>
            <a href={`#${item.id}`} className="text-muted no-underline hover:text-ink">
              {item.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Sources({ sources }: { sources: Source[] }) {
  return (
    <section className="measure flex flex-col gap-3 border-t border-line pt-4" aria-labelledby="sources">
      <h2 id="sources" className="font-display text-[1.4rem]">
        Sources
      </h2>
      <ol className="flex flex-col gap-2.5 text-[0.95rem] leading-snug">
        {sources.map((s, i) => {
          const href = s.type === 'arxiv' && s.id ? `https://arxiv.org/abs/${s.id}` : s.url;
          return (
            <li key={i} className="flex flex-col">
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {s.title}
                </a>
              ) : (
                <span>{s.title}</span>
              )}
              <span className="text-xs text-muted">
                <span className="mono uppercase">{s.type === 'arxiv' && s.id ? `arXiv ${s.id}` : s.type}</span>
                {s.author ? ` · ${s.author}` : ''}
                {s.where ? ` · ${s.where}` : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Stages({ entry, site, statusOf }: { entry: Entry; site: Site; statusOf: StatusOf }) {
  return (
    <section className="measure flex flex-col" aria-label="Stages">
      <h2 className="font-display mb-3 text-[1.65rem]">Stages</h2>
      <ol className="flex flex-col">
        {entry.stages!.map((stage, i) => {
          const present = stage.items.filter((s) => site.bySlug.has(s));
          const done = present.filter((s) => statusOf(s) === 'done').length;
          return (
            <li key={i} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 border-t border-line py-5">
              <span className="num pt-1 text-sm text-muted">{String(i + 1).padStart(2, '0')}</span>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <h3 className="text-[1.12rem] font-semibold leading-snug">{stage.title}</h3>
                  {stage.goal && <p className="text-muted">{stage.goal}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <ProgressBar done={done} total={stage.items.length} />
                  </div>
                  <span className="num text-xs text-muted">
                    {done}/{stage.items.length}
                  </span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {stage.items.map((slug) => {
                    const item = site.bySlug.get(slug);
                    return (
                      <li key={slug} className="flex flex-wrap items-center justify-between gap-x-4">
                        <PageLink slug={slug} site={site} statusOf={statusOf} />
                        {item && (
                          <span className="eyebrow">
                            {[item.level ? `L${item.level}` : null, item.minutes ? `${item.minutes} min` : null, item.kind]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function LeadsTo({ entry, site, statusOf }: { entry: Entry; site: Site; statusOf: StatusOf }) {
  const slugs = site.leadsTo.get(entry.slug) ?? [];
  if (slugs.length === 0) return null;
  return (
    <section className="measure flex flex-col gap-2 border-t border-line pt-4" aria-label="Leads to">
      <div className="label">Leads to</div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
        {slugs.map((slug) => (
          <li key={slug}>
            <PageLink slug={slug} site={site} statusOf={statusOf} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PrevNext({ entry, site }: { entry: Entry; site: Site }) {
  const order = site.primaryOrder;
  const i = order.indexOf(entry.slug);
  if (i < 0 || !site.primaryRoadmap) return null;
  const prev = i > 0 ? site.bySlug.get(order[i - 1]) : undefined;
  const next = i < order.length - 1 ? site.bySlug.get(order[i + 1]) : undefined;
  return (
    <nav className="measure grid grid-cols-2 gap-4 border-t border-line pt-4" aria-label="Roadmap order">
      <div>
        {prev && (
          <Link href={entryHref(prev.kind, prev.slug)} data-nav="prev" className="flex flex-col no-underline">
            <span className="label">[ Previous</span>
            <span>{prev.title}</span>
          </Link>
        )}
      </div>
      <div className="text-right">
        {next && (
          <Link href={entryHref(next.kind, next.slug)} data-nav="next" className="flex flex-col no-underline">
            <span className="label">Next ]</span>
            <span>{next.title}</span>
          </Link>
        )}
      </div>
      <div className="label col-span-2">
        {i + 1} of {order.length} in{' '}
        <Link href={entryHref('roadmap', site.primaryRoadmap.slug)}>{site.primaryRoadmap.title}</Link>
      </div>
    </nav>
  );
}
