# MCP endpoint

The studio (`HATCHER_MODE=studio`) serves an MCP server at `POST /api/mcp` for agents. The public
site does not have it (404). Agents connect to it directly over HTTPS; there is no client package
to install.

## Connecting an agent

1. Sign in to the studio, open **Account** (`/account`) and create a key with the least access
   that does the job: *read*, *read and write drafts*, or (admins only) *read, write and publish*.
   The key is shown once.
2. Export it where your agent starts (shell profile or a secrets manager), and never commit it:

   ```sh
   export HATCHER_API_KEY=hk_...
   ```

3. Add the server to your agent. Replace the URL with your studio's.

   Claude Code (`.mcp.json` in a project, or `~/.claude.json`):

   ```json
   { "mcpServers": { "hatcher": {
       "type": "http",
       "url": "https://hatcher-studio.example/api/mcp",
       "headers": { "Authorization": "Bearer ${HATCHER_API_KEY}" } } } }
   ```

   Codex (`~/.codex/config.toml`):

   ```toml
   [mcp_servers.hatcher]
   url = "https://hatcher-studio.example/api/mcp"
   bearer_token_env_var = "HATCHER_API_KEY"
   ```

   Cursor (`.cursor/mcp.json` or `~/.cursor/mcp.json`):

   ```json
   { "mcpServers": { "hatcher": {
       "url": "https://hatcher-studio.example/api/mcp",
       "headers": { "Authorization": "Bearer ${env:HATCHER_API_KEY}" } } } }
   ```

   If an environment variable is not an option, put the key itself in place of the variable in
   your local, private copy of the config.

4. Optionally give the agent the workflow skill: copy [`skills/hatcher/`](../skills/hatcher) into
   its skills folder (Claude Code: `~/.claude/skills/hatcher/`). The `guide` tool returns the same
   rules and the full page format, so agents without skills still work.

Revoke a key at `/account` if it leaks; it stops working on the next request.

## Transport and authentication

- Streamable HTTP, **stateless**: every request is a JSON-RPC message in a `POST` with
  `Accept: application/json, text/event-stream`. Responses are plain JSON. There are no sessions
  and no `GET` stream (405).
- Every request carries `Authorization: Bearer hk_...`, an API key created at `/account`.
  Missing, invalid, expired or revoked keys, and keys of banned users, get 401 with
  `WWW-Authenticate: Bearer`.
- A key's access (read, write or publish) is fixed when it is created and never exceeds the
  owner's role. It is intersected with the owner's **current** role on every request, so demoting
  a user takes effect immediately.
- Requests with a browser `Origin` other than the studio's get 403. Bodies are capped at 32 MB.
- Keys are rate-limited to 600 requests a minute.

## Tools

| Tool | Access | Does |
|------|--------|------|
| `guide` | any | Page format, writing rules, limits, and what this key may do |
| `list_pages` | any | Pages with title, status, summary (`kind`, `status`, `query` filters) |
| `get_page` | any | Main file source, file list, and `version` |
| `read_file` | any | One file from a page folder (text, or base64 for binary) |
| `validate_page` | write | Dry run of `write_page`: errors and warnings, nothing saved |
| `write_page` | write | Create or change a page; validated; nothing saved unless valid |
| `delete_page` | write | Delete a page (published pages need publish) |
| `set_status` | publish | Publish (`ready`, must be valid) or unpublish (`draft`) |

Keys without write access see published, valid pages only.

## Writing pages

A page is a folder, `<kind dir>/<slug>/`, holding `index.mdx` or `index.html` plus any figures and
assets. Flat pages (`<slug>.mdx`) are read as their index file and become folders when written.

`write_page` takes `files` (each `{ path, text }` or `{ path, base64 }`) to create or replace and
`delete` (paths to remove). The page as it would be after the change is built in
`CONTENT_DIR/.staging/`, parsed and validated with the same checks as `npm run validate:content`,
and swapped into place with renames only if it is valid. Writing `index.html` replaces
`index.mdx` and the reverse.

- **Versions.** `get_page` returns a content hash. Changing or deleting an existing page needs it
  as `expected_version`; a stale version is a conflict, so re-read and retry. Omit it to create.
- **Drafts.** Without publish access, a written page must have `status: draft`, and published pages
  cannot be changed or deleted.
- **Limits.** 200 files and 10 MB per page, 2 MB per file, folders 4 levels deep, names of letters,
  digits, `.`, `_` and `-` (no leading dot), and only the file types the sandbox serves.

Tool errors come back as `isError` results whose text is JSON: `{ "error", "code" }`, with `code`
one of `not_found`, `invalid` (plus `errors` and `warnings`), `conflict`, `forbidden` or
`too_large`.

## Audit log

Every `write_page`, `delete_page` and `set_status` call, allowed or not, is recorded in
`DATA_DIR/progress.db`, table `audit_log` (time, user, key, action, target, outcome, error detail).

```sh
sqlite3 "$DATA_DIR/progress.db" "select at, user_id, action, target, ok from audit_log order by id desc limit 20"
```

## Trying it

```sh
curl -s https://hatcher-studio.example/api/mcp \
  -H "Authorization: Bearer $HATCHER_API_KEY" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"guide","arguments":{}}}'
```
