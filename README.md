# Hatcher

The mathematics behind the papers, one page a day. Named after the Hatcher Graduate Library at the
University of Michigan.

Hatcher is a small personal reading site. Each page is one MDX or HTML file (HTML pages and
interactive figures run sandboxed): a concept (one mathematical
idea taught from undergraduate engineering math up), a paper (decomposed into its theorems and their
prerequisites), or a roadmap (an ordered path through both). The site tracks reading progress, keeps
a daily streak, and suggests the next page from the primary roadmap.

## Quick start

```sh
cp .envrc.example .envrc && direnv allow   # CONTENT_DIR, DATA_DIR, PORT, ... (see the file)
npm install
npm run dev                                # http://localhost:3000
```

Other scripts: `npm run build`, `npm start`, `npm test`, `npm run lint`, and
`npm run validate:content`, which parses and compiles every content file and exits non-zero on any
error (run it after writing content).

## Docker

```sh
npm run docker:up     # create the data dirs, then docker compose up -d --build
npm run docker:logs   # site; npm run agent:logs for the agent
npm run docker:down
```

Compose runs the site and an `agent` service: Claude Code with the paper-to-guided-learning
plugin, which writes draft pages on a schedule from a queue. Live data lives outside the repo,
under `~/Databases/hatcher/` (`content/`, `database/`, `agent/`), set by the variables in
`.envrc.example`. Content is service data and is not part of this repo. Pages written into the live
content directory show up in the open browser within about two seconds, with no rebuild. See
[docs/deployment.md](docs/deployment.md) for setup, the queue, logs, and promoting agent pages.

## Content

Pages live in `$CONTENT_DIR/concepts/`, `papers/`, and `roadmaps/` (default `./content`, gitignored);
none are committed here. The frontmatter,
body skeleton, and available components (`<Theorem>`, `<Proof>`, `<Example>`, `<Exercise>`, ...)
are specified in [docs/content-format.md](docs/content-format.md). A roadmap with `primary: true`
drives the "Next up" suggestion and the prev/next links; otherwise the first roadmap by title does.

The companion plugin at `../paper-to-guided-learning-plugin` generates these files: its agents
decompose a paper into concept and paper pages that follow the content format and write them into
`CONTENT_DIR`. The running site picks them up live.

## Progress

Reading progress, notes, and a reading log are stored in SQLite at `$DATA_DIR/progress.db`
(default `./data`, gitignored; `~/Databases/hatcher/database` with the example `.envrc`), using Node's built-in `node:sqlite`. Delete the file to start over.

## Agents

The studio serves an MCP endpoint at `/api/mcp` for agents with API keys from `/account`: read,
validate, write and publish pages. See [docs/mcp.md](docs/mcp.md).

See [docs/architecture.md](docs/architecture.md) for how the pieces fit together.
