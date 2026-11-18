# Content format

Every page on the site is one file under `content/`, written in **MDX** or **HTML**. Both are
first-class: same frontmatter, same page chrome (header, progress, table of contents, sources,
prerequisite links). The site reads the directory at request time, so adding or editing a file is
enough; nothing needs rebuilding.

```
content/
  concepts/   # one mathematical idea, taught from the user's background up
  papers/     # one paper, decomposed into its theorems and their prerequisites
  roadmaps/   # an ordered path through concepts and papers
```

Each page in those directories takes one of four shapes:

```
<kind>/<slug>.mdx                 # MDX page
<kind>/<slug>.html                # HTML page
<kind>/<slug>/index.mdx           # MDX page folder: may hold figures/ and other assets
<kind>/<slug>/index.html          # HTML page folder: may hold its scripts, styles, data, images
```

The slug is the file or folder name: lowercase, hyphenated, stable once published. A slug may be
used once per kind; the validator reports a file and a folder that share one.

**Which format?** MDX for prose-first pages built from the components below. HTML when the page
is the interaction: animations, simulations, custom layouts. HTML pages and MDX figures run in a
sandbox (see "HTML pages and figures").

## Frontmatter

Both formats start with the same YAML block. In an HTML page it sits above the markup and is
removed before the page is served.

```yaml
---
title: "Itô's lemma"
kind: concept                 # concept | paper | roadmap
summary: "Apply the ordinary chain rule to a random path and you get the wrong answer, consistently and measurably. Itô's lemma is the correction."
tags: [stochastic-calculus, sde, diffusion-models]   # one to three
level: 2                      # 1..5, see "Levels"
prerequisites: [brownian-motion, quadratic-variation]   # slugs of concept pages
estimated_minutes: 45
status: ready                 # draft | ready
created: 2026-09-23
updated: 2026-09-23
sources:
  - type: book                # book | arxiv | lecture | x | web
    title: "Brownian Motion and Stochastic Calculus"
    author: "Karatzas & Shreve"
    where: "Ch. 3"
  - type: arxiv
    id: "2011.13456"
    title: "Score-Based Generative Modeling through SDEs"
---
```

**`summary`** is the page's introduction on cards and at the top of the page, not an abstract.
Write one or two plain sentences (about 25 to 45 words) that make a curious reader want to open the
page: a question, a tension or a surprising payoff, concrete and accurate. No phrase lists, no
hype, no math markup (it is shown as plain text).

**`tags`**: one to three, preferring tags other pages share so the tag filter stays useful. Pages
show at most three, and the validator warns about more.

Paper pages add a `paper` block:

```yaml
paper:
  arxiv_id: "2210.02747"
  authors: ["Yaron Lipman", "Ricky T. Q. Chen", "..."]
  year: 2022
  venue: "ICLR 2023"
  recognition: ["ICLR 2023"]          # oral, spotlight, best paper, citation count, etc.
  why_it_matters: "One sentence on why a robotics/RL person should read it."
  theorems: 3                          # number of results decomposed on the page
```

Roadmap pages add `stages`, an ordered list, and may set `primary: true` on exactly one roadmap;
the primary roadmap drives the landing page's "Next up" and the prev/next links on pages. Each stage lists slugs in reading order:

```yaml
stages:
  - title: "Probability you can compute with"
    goal: "Treat expectations as integrals and conditional expectation as a projection."
    items: [measure-theoretic-probability, conditional-expectation]
```

### Levels

| level | meaning |
|---|---|
| 1 | Uses only undergraduate engineering calculus, linear algebra, and probability. |
| 2 | Uses a first graduate course in probability or stochastic processes. |
| 3 | Needs one or more level-2 concept pages from this site. |
| 4 | Research-paper level; expects fluency with the area. |
| 5 | Frontier; the page exists to make one recent result readable. |

## Body

Write for a reader with undergraduate engineering math and one graduate probability
course. Every page follows the same skeleton so it can be read in one sitting.

Concept pages:

1. **Why you need this** (two or three sentences naming the papers or methods that use it).
2. **Setup** (notation, minimal definitions).
3. **The idea** (statements, with `<Definition>`, `<Theorem>`, `<Proof>`).
4. **Worked example by hand** (`<Example>`; small dimension, real numbers, every step shown).
5. **Where it shows up** (which papers, which equations).
6. **Exercises** (`<Exercise>` with hints; two to four).
7. **Going deeper** (references).

Paper pages:

1. **Why this paper** (recognition, what it changed).
2. **Setting and notation** (translate the paper's notation into the site's).
3. **Results at a glance** (one line per theorem, with its prerequisite slugs).
4. One section per main result: statement, prerequisite check, proof walkthrough, what the
   proof really uses.
5. **Worked example by hand** (a toy instance of the paper's core object).
6. **Reading order** (the prerequisite pages to read first, in order).

### No JavaScript in MDX

MDX pages render in the site itself, so they cannot run code. Compilation fails on `import` /
`export`, `{expressions}` outside math and code, `on*` attributes, `javascript:`/`data:` URLs, and
HTML elements other than inert prose ones (`div`, `span`, `details`, `summary`, `sub`, `sup`,
`kbd`, `mark`, `img`, `a`, tables, lists and headings). Write literal braces in math (`$\{x\}$`)
or code. For anything interactive, use a `<Figure>` or an HTML page; both run sandboxed.

## Components

These are available in every MDX file without importing.

```mdx
<Definition name="Quadratic variation">
  ...
</Definition>

<Theorem name="Itô's lemma" label="Thm 1">
  ...
</Theorem>

<Lemma name="...">...</Lemma>
<Proposition name="...">...</Proposition>
<Corollary name="...">...</Corollary>

<Proof>
  ...
</Proof>

<Example title="Geometric Brownian motion, by hand">
  ...
</Example>

<Intuition>...</Intuition>
<Warning>...</Warning>
<Exercise hint="Expand to second order.">
  ...
</Exercise>

<Cite id="2011.13456" />
```

`<Proof>` is collapsible and open by default; `<Intuition>` is a short plain-language aside;
`<Warning>` flags a common mistake; `<Cite>` links to a source listed in the frontmatter. Attribute
values are always quoted strings: MDX pages allow no `{...}` expressions or comments.

Math is written with `$...$` inline and `$$...$$` display, rendered by KaTeX. Prefer
`\mathbb{E}`, `\mathrm{d}t`, `\langle \cdot,\cdot \rangle`. Number only what you refer to.

Two Markdown pitfalls break compilation. Outside math, never write a bare `{`, `}`, or `<`.
And never wrap an inline `$...$` expression onto a line that begins with `-` or `+`: Markdown
reads the operator as a list marker. End the previous line with the operator instead. Lines
inside a `$$` block are safe.

Links between pages are relative to the site root: `[Brownian motion](/concepts/brownian-motion)`.

## Figures in MDX

A page folder can embed interactive HTML figures:

```mdx
<Figure src="figures/vector-field.html" caption="The field $v_t(x)$ at time $t$" height="360" />
```

`src` is a path inside the page folder ending in `.html`. `caption` may contain inline math.
`height` is only the starting height in pixels; the frame resizes to fit its content. A figure
file can be a fragment (no `<html>`/`<head>`) or a full document, and follows the rules below.

## HTML pages and figures

HTML pages and figures run in a sandboxed frame with no access to the site. Write them as
self-contained documents:

- **Body only.** Don't repeat the title, summary, tags or sources; the site renders them from the
  frontmatter. Start with the first section.
- **Headings.** Give each `<h2>` and `<h3>` an `id`; those with ids form the table of contents.
- **Links.** Site links are root-relative (`<a href="/concepts/brownian-motion">`) and open in the
  site. `#id` links scroll the page. `https://` links open in a new tab.
- **Code and assets** load only from the page's own folder or from `/_lib`. Nothing from other
  hosts loads (no CDNs, fonts, images or fetches): copy what you need into the page folder.
  `fetch()` works for files in the page folder (for example `fetch('data.json')`).
- **No storage.** Cookies, `localStorage` and IndexedDB are unavailable; keep state in variables.
- **Styling.** `/_lib/hatcher.css` is loaded first and gives the site's typography and color tokens
  (`var(--ink)`, `var(--muted)`, `var(--accent)`, `var(--line)`, `var(--surface)`, `var(--bg)`),
  switched for dark mode. Use the tokens instead of hard-coded colors.
- **Theme changes.** `hatcher.theme()` returns `'light'` or `'dark'`; `hatcher.onTheme(fn)` calls
  `fn` when it changes, for redrawing canvases.
- **Math.** Load KaTeX from `/_lib`, and `$...$`/`$$...$$` in the document are rendered:

  ```html
  <link rel="stylesheet" href="/_lib/katex/katex.min.css">
  <script defer src="/_lib/katex/katex.min.js"></script>
  <script defer src="/_lib/katex/contrib/auto-render.min.js"></script>
  ```

- **Motion.** Respect `prefers-reduced-motion` for anything that animates on its own.

A minimal HTML page:

```html
---
title: "Random walks"
kind: concept
summary: "The discrete ancestor of Brownian motion, animated."
level: 1
---
<h2 id="why">Why you need this</h2>
<p>A random walk is the discrete ancestor of <a href="/concepts/brownian-motion">Brownian motion</a>.</p>
<canvas id="c"></canvas>
<script src="walk.js"></script>
```

Run `npm run validate:content` after writing: it reports resources loaded from other hosts,
missing figure files, and figures in pages that are not folders.
