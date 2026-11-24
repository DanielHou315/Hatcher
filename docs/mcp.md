# MCP endpoint

Hatcher serves an MCP server at `POST /api/mcp` for agents. Agents connect to it directly over
HTTPS; there is no client package to install.

## Connecting an agent

1. Sign in, open **Account** (`/account`) and create a key: *read your pages*, or *read and write
   your pages*. The key is shown once. It acts as you: it reaches your pages and the pages shared
   with you, and can never do more than you can.
2. Export it where your agent starts (shell profile or a secrets manager), and never commit it:

   ```sh
   export HATCHER_API_KEY=hk_...
   ```

3. Add the server to your agent. Replace the URL with your Hatcher's.

   Claude Code (`.mcp.json` in a project, or `~/.claude.json`):

   ```json
   { "mcpServers": { "hatcher": {
       "type": "http",
       "url": "https://hatcher.example/api/mcp",
       "headers": { "Authorization": "Bearer ${HATCHER_API_KEY}" } } } }
   ```

   Codex (`~/.codex/config.toml`):

   ```toml
   [mcp_servers.hatcher]
   url = "https://hatcher.example/api/mcp"
   bearer_token_env_var = "HATCHER_API_KEY"
   ```

   Cursor (`.cursor/mcp.json` or `~/.cursor/mcp.json`):

   ```json
   { "mcpServers": { "hatcher": {
       "url": "https://hatcher.example/api/mcp",
       "headers": { "Authorization": "Bearer ${env:HATCHER_API_KEY}" } } } }
   ```

4. Optionally give the agent the skill: copy [`skills/hatcher/`](../skills/hatcher) into its
   skills folder (Claude Code: `~/.claude/skills/hatcher/`). The `guide` tool returns the same
   rules, so agents without skills still work.

Revoke a key at `/account` if it leaks; it stops working on the next request.

## Transport and authentication

- Streamable HTTP, **stateless**: every request is a JSON-RPC message in a `POST` with
  `Accept: application/json, text/event-stream`. Responses are plain JSON. There are no sessions
  and no `GET` stream (405).
- Every request carries `Authorization: Bearer hk_...`. Missing, invalid, expired or revoked keys,
  and keys of suspended users, get 401 with `WWW-Authenticate: Bearer`.
- Requests with a browser `Origin` other than the site's get 403. Bodies are capped at 64 MB.
- Keys are rate-limited to 600 requests a minute.

## Tools

| Tool | Key | Does |
|------|-----|------|
| `guide` | any | How pages work, which hosts pages may load from, limits, what this key may do |
| `list_pages` | any | Your pages and pages shared with you, with access and URL (`query` filter) |
| `get_page` | any | Details, file list, the text of `index.html`, and `version` (or an earlier `version`) |
| `read_file` | any | One file (text, or base64 for binary) |
| `list_versions` | any | Version history |
| `create_page` | write | New private page from `index.html` and other files |
| `update_page` | write | New version: files to add or replace, paths to delete; the owner may also retitle |
| `restore_version` | write | New version copied from an earlier one |

Sharing and deleting are done by the owner in the web UI, never by agents.

`create_page` and `update_page` take `files` as `{ path, text }` or `{ path, base64 }`. Changing a
page needs its current `version` as `expected_version`; a stale one is a `conflict`, so re-read and
retry. Results include `warnings` for references to hosts pages may not load from.

Tool errors come back as `isError` results whose text is JSON: `{ "error", "code" }`, with `code`
one of `not_found`, `invalid`, `conflict`, `forbidden` or `too_large`. A page that does not exist
and one that is not shared with you give the same `not_found`.

## Audit log

Every change, from the UI or an agent, allowed or not, is recorded in `DATA_DIR/hatcher.db`, table
`audit_log` (time, user, key, action, target, outcome, error detail).

```sh
sqlite3 "$DATA_DIR/hatcher.db" "select at, user_id, key_id, action, target, ok from audit_log order by id desc limit 20"
```

## Trying it

```sh
curl -s https://hatcher.example/api/mcp \
  -H "Authorization: Bearer $HATCHER_API_KEY" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"guide","arguments":{}}}'
```
