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

## Public site and studio

One image, two modes (`HATCHER_MODE`), deployed as separate containers:

- **public** (default) is the anonymous, read-only site. It serves published pages only. No
  account code runs: `/login`, `/account`, `/admin`, `/api/auth`, `/api/keys`, `/api/progress` and
  `/api/mcp` return 404 (`src/middleware.ts`, and `getViewer`/`getAuth` refuse on their own). It
  needs no secrets and never opens `DATA_DIR`, so the content mount can be read-only.
- **studio** is sign-in only: accounts, drafts, per-user progress, API keys and the MCP endpoint.
  Put it on its own host, ideally also behind Cloudflare Access.

Neither mode executes page code on the server. MDX is compiled with JavaScript disallowed (see
"MDX safety" below) and HTML pages only ever run in the sandboxed frame.

## MDX safety

MDX renders in the site's own origin, so `remarkSafeMdx` (`src/lib/mdx-plugins.ts`) fails
compilation on `import`/`export`, `{expressions}`, expression or spread attributes, any lowercase
element outside an allowlist of inert prose elements (no `script`, `style`, `iframe`, `form`,
`svg`, ...), `on*` handlers, `srcdoc`, and URLs other than relative, `http(s)` or `mailto`. The
validator runs the same check. Interactive code goes in a `<Figure>` or an HTML page.

## Accounts and access (studio)

Better Auth (`src/lib/auth.ts`) handles email/password and optional GitHub/Google sign-in,
sessions, the admin plugin (roles, bans, user management) and the API-key plugin. Its tables live
in `$DATA_DIR/auth.db` and are migrated at startup (`src/instrumentation.ts`).

| Role | Pages | Also |
|------|-------|------|
| `user` | read published pages | per-user progress, read-only API keys |
| `editor` | also see drafts and invalid pages | write keys (drafts only) |
| `admin` | also publish | manage users at `/admin/users` |

- The first admin signs up with an email listed in `HATCHER_ADMIN_EMAILS`. With
  `HATCHER_SIGNUP=closed` (default) everyone else is created by an admin.
- Sandboxed frames cannot send cookies, so the studio frames every page through
  `/c/~<token>/...`, an HMAC token scoped to one page that lasts about six hours
  (`src/lib/content-token.ts`). The public site has no tokens and serves published pages only.
- API keys (`hk_...`, created at `/account`) carry fixed access (read, write or publish) that never
  exceeds the owner's role, and each use re-checks the owner's current role. Keys are hashed at
  rest, shown once, rate-limited to 600 requests a minute, and expire after 30/90/365 days or never.

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
