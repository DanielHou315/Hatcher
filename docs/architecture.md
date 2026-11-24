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
`/c/~<token>/<id>/<version>/index.html`. The token is an HMAC of the page id, the version, the
reader's user id and an expiry (about two hours), because a sandboxed frame cannot send the session
cookie. The content route verifies it, checks again that the reader may see the page and is not
suspended (so unsharing takes effect at once), and serves the file with:

- `Content-Security-Policy: sandbox allow-scripts …` without `allow-same-origin`, so page code runs
  with an opaque origin even when a file is opened directly;
- `script-src`, `style-src`, `font-src`, `img-src`, `connect-src` and friends limited to `'self'`
  and the CDN hosts in the admin settings, so pages can load libraries but not fetch from or post to
  anywhere else; `default-src 'none'`, `form-action 'none'`;
- `frame-ancestors` limited to the site on a page's `index.html`. Other HTML files carry no
  `frame-ancestors`, so a page can frame its own figures (its opaque origin matches no source);
  they still need the token and still run sandboxed.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.

The frame's `sandbox` is `allow-scripts allow-popups allow-forms`: no same-origin, no dialogs (a
`prompt()` could pose as the site), no downloads, and popups stay sandboxed. The site's own pages
send `frame-src` limited to the site and the content origin, so a page cannot navigate its frame
to another site. CSP cannot stop a page from opening a new tab when the reader clicks, so a page
the reader opens and clicks on could still carry what it shows them out in a URL: pages are private
to the people they are shared with, and readers should trust their authors.

Set `CONTENT_ORIGIN` to serve page files from a separate hostname (proxied to the same app); that
hostname then serves page content and nothing else, and `SITE_ORIGIN` is allowed to frame it. A
public site should do this, with a separate registrable domain (not a subdomain of the site), and
only then is "Open" (a page in its own tab) offered. Without it, content requested as a top-level
document is refused, so a page can never pose as the site in its own tab.

## Quotas and limits

- Each page: 300 files, 50 MB, 10 MB per file. Request bodies are capped while they are read
  (chunked ones too): 64 KB for sign-in and account endpoints, 256 KB for settings and shares, and
  the page limits for uploads.
- Each user: storage for all their pages and versions, and how many pages they own (default 1 GB
  and 500, set at `/admin`, with per-user limits under Users). A page counts against its owner,
  whoever edits it. A new version hard-links the files it does not change, so it costs only what
  it changes.
- Rate limits (in memory, per process): 120 page changes per user per 10 minutes, 30 shares per
  user per 10 minutes, one share notice per page and person per day, 600 API key requests a
  minute, and Better Auth's 100 auth requests a minute per address.

The viewer polls the page's version every few seconds while it shows the latest one, so a page an
agent is writing updates in place.

## Accounts and email

- Registration is open, limited to email domains, or closed, set at `/admin` and read whenever
  someone registers. Limiting by domain requires email confirmation. Until an admin exists,
  `HATCHER_ADMIN_EMAILS` may register and become admins: that is how the first admin is made. An
  address from GitHub or Google that the provider has not confirmed never counts for a domain or
  as the admin.
- Admins create, suspend and delete accounts, but cannot set anyone's password (that would let
  them read their pages); with email set up they can send a reset link.
- Changing or resetting a password signs out other sessions and revokes the user's API keys.
  Creating a key needs a sign-in less than a day old.
- The audit log (`audit_log` in `hatcher.db`) records page changes, shares, settings, quotas, sign-ins
  and sign-ups (failed ones too), 2FA changes, password changes and admin actions.
- Rate limits use the visitor's address from `HATCHER_CLIENT_IP_HEADER` (default
  `x-forwarded-for`). Set it to a header your proxy overwrites: `cf-connecting-ip` behind
  Cloudflare, or the header your own proxy sets.
- Two-factor sign-in uses authenticator apps (TOTP) with backup codes and optional 30-day trusted
  devices.
- With SMTP configured at `/admin`: password reset links, optional email confirmation, welcome and
  share notices. The SMTP password is stored encrypted with a key derived from
  `BETTER_AUTH_SECRET`; changing that secret means entering it again (and signs everyone out).
