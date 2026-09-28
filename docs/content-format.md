# Content format

Every page on the site is one MDX file under `content/`. The site reads the directory at
request time, so adding or editing a file is enough; nothing needs rebuilding.

```
content/
  concepts/<slug>.mdx    # one mathematical idea, taught from the user's background up
  papers/<slug>.mdx      # one paper, decomposed into its theorems and their prerequisites
  roadmaps/<slug>.mdx    # an ordered path through concepts and papers
```

The slug is the file name without `.mdx`: lowercase, hyphenated, stable once published.

## Frontmatter

```yaml
---
title: "Itô's lemma"
kind: concept                 # concept | paper | roadmap
summary: "The chain rule for functions of a Brownian path, and why the second-order term appears."
tags: [stochastic-calculus, sde, diffusion-models]
track: stochastic-analysis    # one of the track ids listed below
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

### Tracks

| id | name |
|---|---|
| `foundations` | Analysis, linear algebra, and probability refreshers |
| `stochastic-analysis` | Brownian motion, Itô calculus, SDEs, Fokker–Planck |
| `optimal-transport` | Wasserstein geometry, entropic OT, Schrödinger bridges |
| `generative-modeling` | Score matching, diffusion, flow matching |
| `reinforcement-learning` | MDPs, Bellman operators, policy gradients, regularized RL |
| `statistical-learning` | Concentration, generalization, estimation |
| `geometry-and-robotics` | Lie groups, manifolds, kinematics |
| `papers` | Paper decompositions (set automatically for `kind: paper`) |

### Levels

| level | meaning |
|---|---|
| 1 | Uses only undergraduate engineering calculus, linear algebra, and probability. |
| 2 | Uses a first graduate course in probability or stochastic processes. |
| 3 | Needs one or more level-2 concept pages from this site. |
| 4 | Research-paper level; expects fluency with the track. |
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

<Proof>            {/* collapsible; open by default */}
  ...
</Proof>

<Example title="Geometric Brownian motion, by hand">
  ...
</Example>

<Intuition>...</Intuition>     {/* a short plain-language aside */}
<Warning>...</Warning>         {/* a common mistake */}
<Exercise hint="Expand to second order.">
  ...
</Exercise>

<Cite id="2011.13456" />       {/* renders a link to the source listed in frontmatter */}
```

Math is written with `$...$` inline and `$$...$$` display, rendered by KaTeX. Prefer
`\mathbb{E}`, `\mathrm{d}t`, `\langle \cdot,\cdot \rangle`. Number only what you refer to.

Two Markdown pitfalls break compilation. Outside math, never write a bare `{`, `}`, or `<`.
And never wrap an inline `$...$` expression onto a line that begins with `-` or `+`: Markdown
reads the operator as a list marker. End the previous line with the operator instead. Lines
inside a `$$` block are safe.

Links between pages are relative to the site root: `[Brownian motion](/concepts/brownian-motion)`.
