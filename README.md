# Marginalia

The mathematics behind the papers, one page a day.

Marginalia is a small personal reading site. Each page is one MDX file: a concept (one mathematical
idea taught from undergraduate engineering math up), a paper (decomposed into its theorems and their
prerequisites), or a roadmap (an ordered path through both). The site tracks reading progress, keeps
a daily streak, and suggests the next page from the primary roadmap.

## Quick start

```sh
cp .envrc.example .envrc && direnv allow   # CONTENT_DIR, DATA_DIR, PORT, CHOKIDAR_USEPOLLING
npm install
npm run dev                                # http://localhost:3000
```

Other scripts: `npm run build`, `npm start`, `npm test`, `npm run lint`, and
`npm run validate:content`, which parses and compiles every content file and exits non-zero on any
error (run it after writing content).

## Docker

```sh
npm run docker:up     # mkdir -p data && docker compose up -d --build
npm run docker:logs
npm run docker:down
```

`./content` is mounted read-only and `./data` read-write. Create `./data` before the first
`docker compose up` (the npm script does this) so it is owned by you rather than root. Edits to
files in `./content` show up in the open browser within about two seconds, with no rebuild.

## Content

Pages live in `content/concepts/`, `content/papers/`, and `content/roadmaps/`. The frontmatter,
body skeleton, and available components (`<Theorem>`, `<Proof>`, `<Example>`, `<Exercise>`, ...)
are specified in [docs/content-format.md](docs/content-format.md). A roadmap with `primary: true`
drives the "Next up" suggestion and the prev/next links; otherwise the first roadmap by title does.

The companion plugin at `../paper-to-guided-learning-plugin` generates these files: its agents
decompose a paper into concept and paper pages that follow the content format and write them into
`content/`. The running site picks them up live.

## Progress

Reading progress, notes, and a reading log are stored in SQLite at `$DATA_DIR/progress.db`
(default `./data`, gitignored), using Node's built-in `node:sqlite`. Delete the file to start over.

See [docs/architecture.md](docs/architecture.md) for how the pieces fit together.
