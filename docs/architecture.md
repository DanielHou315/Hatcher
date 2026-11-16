# Architecture

Next.js 15 (App Router, `output: 'standalone'`) with React 19, Tailwind v4, and a small token
stylesheet in `src/app/globals.css`.

## Content loading

Content is read at request time. Every route that shows content is `force-dynamic`; nothing about
content is baked into the build.

- `src/lib/content.ts` lists `CONTENT_DIR/{concepts,papers,roadmaps}/` on every call: flat
  `<slug>.mdx`/`<slug>.html` files and page folders with `index.mdx`/`index.html`.
- Each file is parsed with gray-matter and validated with zod (`src/lib/schema.ts`, mirroring
  `docs/content-format.md`). A file that fails becomes an entry with an `error`; it is listed with an
  "invalid" badge and its page shows the error and raw frontmatter.
- Parsed entries are cached in a process-wide map keyed by absolute path, checked against
  `mtimeMs` and `size` on each listing. Deleted files drop out of the cache.
- Derived data (`buildSite`): `leadsTo` (inverse prerequisites), missing prerequisites, tracks
  sorted by level then title, tag counts, and the primary roadmap order.
- `src/lib/mdx.tsx` compiles the body with `next-mdx-remote/rsc` (remark-gfm, remark-math,
  rehype-slug, rehype-katex) and collects the h2/h3 table of contents. Unknown components and
  syntax errors are reported in an error panel instead of failing the page.

## Sandboxed HTML

HTML pages and MDX `<Figure>`s are untrusted code, so they never run in the site's origin.

- **Content route.** `src/app/c/[...path]/route.ts` serves `/c/<kind dir>/<slug>/index.html` (the
  page's HTML, frontmatter stripped) and files inside a page folder, by an extension allowlist.
  MDX sources, hidden files and anything outside a page folder are 404 (`src/lib/sandbox.ts`).
- **Policy.** Every response carries `Content-Security-Policy: sandbox allow-scripts allow-popups
  allow-popups-to-escape-sandbox; …`. The `sandbox` directive gives the document an opaque origin
  even when its URL is opened directly: no cookies, storage or access to the site. Scripts, styles,
  images and fonts load only from this server; `connect-src 'self'`, `form-action 'none'`.
- **Frames.** `SandboxFrame` renders `<iframe sandbox="allow-scripts allow-popups
  allow-popups-to-escape-sandbox">`, without `allow-same-origin`, lazy-loaded for figures. It
  trusts a message only by `event.source` (the frame's origin is `"null"`).
- **Helper.** `public/_lib/hatcher.js` and `hatcher.css` are injected into every sandboxed
  document. The helper reports its height (also on a timer, since Chrome throttles off-screen
  cross-origin frames), applies the site theme, forwards `#anchor` and site links to the page, and
  opens `https://` links in a new tab. The page sends `hatcher:hello` on mount so a frame that
  loaded before hydration repeats its state.
- **Writes.** `POST /api/progress*` rejects requests whose `Origin` is another host or `null`.
- **Libraries and fonts.** `scripts/vendor-libs.mjs` (run by `predev`/`prebuild`) copies KaTeX into
  `public/_lib/katex/` and the `@fontsource` fonts into `public/_lib/fonts/` (both gitignored). The
  site and every frame load the same `/_lib/fonts/fonts.css`, so they always match. Fonts are
  pinned npm packages: update one by bumping its version, add one in the script's `FONTS` list.
- **Separate content host (optional).** With `CONTENT_ORIGIN` set (for example
  `https://hatcher-content.example.com`, proxied to the same container), frames load from that host
  and `SITE_ORIGIN` is added to `frame-ancestors`. A different registrable domain also puts frames
  in a separate browser process, so a runaway script cannot slow the site.

## Live reload

`GET /api/watch` is a Server-Sent Events stream backed by one chokidar watcher on `CONTENT_DIR`
(polling when `CHOKIDAR_USEPOLLING=1`, as in Docker). Each change is sent as `event: change` with
`{path, type}`; a heartbeat comment goes out every 15 s. The `LiveReload` client component debounces
change events by 400 ms and calls `router.refresh()`, which re-renders server components while
keeping client state and scroll position. The header dot shows the connection state. Frame URLs
carry `?v=<latest mtime in the page folder>`, so a changed HTML page or figure reloads its frame.

## Progress database

SQLite via `node:sqlite` (loaded with `process.getBuiltinModule`), file `DATA_DIR/progress.db`,
WAL mode, tables created on open:

```sql
progress(slug TEXT PRIMARY KEY, status TEXT NOT NULL, notes TEXT, updated_at TEXT NOT NULL)
  -- status: not-started | in-progress | done
reading_log(id INTEGER PRIMARY KEY, slug TEXT NOT NULL, event TEXT NOT NULL, at TEXT NOT NULL)
  -- event: view | status; views are deduplicated to one per slug per local day
```

API: `GET/POST /api/progress`, `POST /api/progress/view`, `GET /api/health`, `GET /api/watch`.
Streaks count consecutive local calendar days with any event, ending today or yesterday.

## Docker

Multi-stage build on `node:24-bookworm-slim`; the runner stage runs `node server.js` from the
standalone output as the non-root `node` user. `docker-compose.yml` mounts `CONTENT_DIR` at
`/app/content` (read-only) and `DATA_DIR` at `/app/data` (defaults `./content` and `./data`), and
health-checks `/api/health`. Content is excluded from the image; it always comes from the volume.

## Agent service

`agent/Dockerfile` builds a second image (Node 24, pinned Claude Code, uv, supercronic, tini) that
runs as uid 1000. `agent/entrypoint.sh` checks for a token, syncs the plugin's `p2gl` environment
from the read-only `/plugin` mount, refreshes the agent's `CLAUDE.md`, and starts supercronic on
`AGENT_SCHEDULE`. Each run (`agent/run-job.sh`) takes the first open line of
`AGENT_DIR/queue.md` (or the first missing prerequisite), renders a prompt from `agent/prompts/`,
runs `claude -p` with the plugin, validates with `p2gl catalog --check`, and marks the queue line.
It writes only to `CONTENT_DIR` (as `status: draft` pages) and `AGENT_DIR`; the site sees new files
through its watcher. Operations are in [deployment.md](deployment.md).
