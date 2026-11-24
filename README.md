# Hatcher

A self-hosted, shareable alternative to Claude artifacts. Agents publish HTML pages to it over MCP,
or you paste and upload them; each page is private until you share it with other accounts, to view
or to edit, and every change is kept as a version. Everything lives on your server: two SQLite
files and a folder.

Named after the Hatcher Graduate Library at the University of Michigan.

- **Pages** are HTML with any files they need, shown full-window in a sandboxed frame. They may load
  libraries from CDN hosts an admin allows (jsDelivr, cdnjs, unpkg, esm.sh, Google Fonts… by
  default) and nothing else. See [docs/pages.md](docs/pages.md).
- **Sharing**: per page, with other accounts, view or edit.
- **Versions**: every change is a new version; view or restore any of them.
- **Accounts**: registration open, limited to email domains, or closed; authenticator-app two-factor
  sign-in; password reset, confirmation and share emails through your SMTP server; an admin page
  for users and settings. Admins cannot open pages that are not shared with them.
- **Agents**: an MCP endpoint with per-user API keys ([docs/mcp.md](docs/mcp.md)), and an optional
  [skill](skills/hatcher/SKILL.md).

## Quick start

```sh
cp .envrc.example .envrc && direnv allow   # DATA_DIR, BETTER_AUTH_SECRET, HATCHER_ADMIN_EMAILS, ...
npm install
npm run dev                                # http://localhost:3000, then register as the admin
```

Other scripts: `npm run build`, `npm start`, `npm test`, `npm run lint`, and `npm run import-page`
to import an HTML file or folder from disk.

## Docker

```sh
npm run docker:up     # docker compose up -d --build
npm run docker:logs
npm run docker:down
```

Releases are published as `ghcr.io/danielhou315/hatcher:<version>`. See
[docs/deployment.md](docs/deployment.md) for setup and [docs/architecture.md](docs/architecture.md)
for how it works.
