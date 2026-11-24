# Architecture

Hatcher is a self-hosted, shareable alternative to Claude artifacts: private HTML pages that agents
publish through the REST API and people share with each other, on your own server, with your data in two
SQLite files and a folder.

## Pieces

| Piece | Where | Does |
|---|---|---|
| Next.js app | `src/app/` | Page list, viewer, editor, account, admin, auth pages, APIs |
| Pages | `src/lib/pages.ts` | Versioned page files on disk |
| Database | `src/lib/db.ts` | Pages, versions, shares, site settings, audit log (`DATA_DIR/hatcher.db`) |
| Accounts | `src/lib/auth.ts` | Better Auth: accounts, sessions, 2FA, API keys, roles (`DATA_DIR/auth.db`) |
| Sandbox | `src/lib/sandbox.ts`, `src/app/c/` | Serves page files under a strict CSP |
| REST API | `src/lib/page-api.ts`, `src/lib/requester.ts`, `src/app/api/` | Pages for the browser and API keys (`docs/api.md`) |
| Email | `src/lib/mail.ts` | SMTP from admin settings |

## Data

```
DATA_DIR/
  auth.db              accounts, sessions, two-factor secrets, API keys (Better Auth)
  hatcher.db           pages, page_versions, shares, settings, audit_log
  pages/<id>/<n>/...   the files of version n of page <id>; never changed after it is written
```

Back up `DATA_DIR` as a whole; nothing else holds state. A page's id is 12 random characters, its
versions count up from 1, and the row in `pages` points at the current one.

**Writes.** A new version is built in `pages/.staging/`, checked (index.html present, paths, size
limits), renamed to `pages/<id>/<n+1>/`, and only then does the page row move to it, in a
transaction that also checks nobody else moved it first. A writer names the version it started
from (`expectedVersion`), so nobody overwrites changes they have not seen. Restoring a version
copies it forward as a new one; history is never rewritten.

## Access

- Everything is sign-in only. `src/middleware.ts` sends visitors without a session to `/login`;
  each page and API checks the session itself.
- A page's owner may view, edit, share, rename and delete it. A share grants one other account
  `read` (view) or `write` (view and edit content). `src/lib/page-access.ts` decides; the same rules
  apply in the UI and the API (`src/lib/page-api.ts`).
- Admins manage accounts and site settings. They have no access to pages that are not theirs or
  shared with them: the admin plugin is configured without impersonation or email changes
  (`src/lib/access.ts`). Anyone with shell access to the server can read `DATA_DIR`, of course.
- API keys act as their owner, limited to read or read-and-write.

## Sandboxed pages

The viewer (`/p/<id>`) checks access, then frames
`/c/~<token>/<id>/<version>/index.html`. The token is an HMAC of the page id with an expiry
(about two hours), because a sandboxed frame cannot send the session cookie. The content route
verifies it and serves the file with:

- `Content-Security-Policy: sandbox allow-scripts …` without `allow-same-origin`, so page code runs
  with an opaque origin even when a file is opened directly;
- `script-src`, `style-src`, `font-src`, `img-src`, `connect-src` and friends limited to `'self'`
  and the CDN hosts in the admin settings, so pages can load libraries but not send data anywhere
  else; `default-src 'none'`, `form-action 'none'`;
- `frame-ancestors` limited to the site on a page's `index.html`. Other HTML files carry no
  `frame-ancestors`, so a page can frame its own figures (its opaque origin matches no source);
  they still need the token and still run sandboxed.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.

Set `CONTENT_ORIGIN` to serve page files from a separate hostname (proxied to the same app) for
defence in depth; `SITE_ORIGIN` is then allowed to frame it.

The viewer polls the page's version every few seconds while it shows the latest one, so a page an
agent is writing updates in place.

## Accounts and email

- Registration is open, limited to email domains, or closed, set at `/admin` and read whenever
  someone registers. `HATCHER_ADMIN_EMAILS` may always register and become admins: that is how the
  first admin is made.
- Two-factor sign-in uses authenticator apps (TOTP) with backup codes and optional 30-day trusted
  devices.
- With SMTP configured at `/admin`: password reset links, optional email confirmation, welcome and
  share notices. The SMTP password is stored encrypted with a key derived from
  `BETTER_AUTH_SECRET`; changing that secret means entering it again (and signs everyone out).
