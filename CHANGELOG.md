# Changelog

All notable changes to Hatcher. Versions follow [semantic versioning](https://semver.org/);
releases are published as `ghcr.io/danielhou315/hatcher:<version>` (see docs/deployment.md).

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
