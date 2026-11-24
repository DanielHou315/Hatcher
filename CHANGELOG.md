# Changelog

All notable changes to Hatcher. Versions follow [semantic versioning](https://semver.org/);
releases are published as `ghcr.io/danielhou315/hatcher:<version>` (see docs/deployment.md).

## [0.3.0] - 2026-11-23

- **REST API for agents and scripts** replaces the MCP endpoint: list, read, create, version,
  restore, rename and delete pages with an API key (`docs/api.md`). The same endpoints serve the
  browser, and now also take JSON bodies.
- The MCP server and the agent skill move to the
  [hatcher-client-plugin](https://github.com/DanielHou315/hatcher-client-plugin) repo, as a local
  (stdio) MCP server that calls this API. Point existing MCP clients at it instead of `/api/mcp`.
- `HATCHER_TRUSTED_ORIGINS` lets people sign in from more than one address (say, a LAN address and
  the public URL). The server now warns at startup when `BETTER_AUTH_URL` is unset, which makes
  every sign-in fail with "Invalid origin".
- Removed: `/api/mcp`, `skills/`, the `@modelcontextprotocol/sdk` dependency.

## [0.2.0] - 2026-11-23

Hatcher becomes a self-hosted, shareable alternative to Claude artifacts. This replaces the reading
library; see "Upgrading from 0.1" in docs/deployment.md.

- **Pages** are HTML with any files they need, private to their owner, shown full-window in a
  sandboxed frame. Create them by pasting or uploading (files or a whole folder) at `/new`, or from
  agents over MCP. The viewer reloads when a new version arrives.
- **Libraries from CDNs.** Pages may load scripts, styles, fonts and data from CDN hosts an admin
  allows (jsDelivr, cdnjs, unpkg, esm.sh, Tailwind, jQuery and Google Fonts by default), and still
  cannot send data anywhere else.
- **Sharing** per page with other accounts, to view or to edit. Owners alone rename, share and delete.
- **Versions.** Every change is a new, immutable version; view any of them, or restore one as a new
  version. Changes name the version they start from, so nobody overwrites unseen work.
- **Accounts.** Registration is open, limited to email domains, or closed, set at `/admin`.
  Authenticator-app two-factor sign-in with backup codes. Password reset, email confirmation,
  welcome and share emails through an SMTP server configured at `/admin` (password stored
  encrypted). Admins manage users (add, invite by email, suspend, delete, set a password) but
  cannot impersonate anyone or open pages not shared with them.
- **MCP tools** for the new model: `list_pages`, `get_page`, `read_file`, `list_versions`,
  `create_page`, `update_page`, `restore_version`. API keys are read or read-and-write and act as
  their owner.
- `npm run import-page` imports an HTML file or folder from disk.
- Removed: the public site and `HATCHER_MODE`, concept/paper/roadmap pages, MDX, tags, levels,
  reading progress, `CONTENT_DIR` and live reload from disk.

## [0.1.0] - 2026-11-18

First release.

- **Pages** in MDX or sandboxed HTML: concept, paper and roadmap pages read from `CONTENT_DIR` at
  request time, with live reload and KaTeX math. MDX pages cannot run code; interactive figures
  and HTML pages run in sandboxed frames that load only from their own page folder and `/_lib`.
- **Two deployments from one image.** `HATCHER_MODE=public` is the anonymous, read-only site with
  no accounts, secrets or data directory. `HATCHER_MODE=studio` is sign-in only, with accounts
  (Better Auth), roles, drafts and per-user reading progress.
- **Agents** connect to the studio's MCP endpoint (`/api/mcp`) with API keys from `/account`:
  read, validate, write drafts and publish, all validated, versioned and audited. Setup for
  Claude Code, Codex and Cursor is in docs/mcp.md, with an optional skill in `skills/hatcher/`.
- **Reading layout**: title, an inviting introduction, then tags, level and reading time; the table
  of contents on the left; sources at the end of each article.
- Content never lives in this repository.
