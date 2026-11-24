# REST API

Everything a person can do with pages in the browser, except sharing, is available over HTTP under
`/api`. Agents use it through the Hatcher MCP client
([hatcher-client-plugin](https://github.com/DanielHou315/hatcher-client-plugin)); scripts can call it
directly.

## Authentication

Create a key at `/account` and send it as `Authorization: Bearer hk_...`. A key acts as its owner,
limited to its access:

- **read**: list and read pages the owner can see.
- **read and write**: also create pages, save versions, restore, and (owner only) rename and delete.

Without a key, requests use the browser session; changes from other origins are refused. Keys are
rate-limited to 600 requests a minute, and every user to 120 page changes per 10 minutes.
Suspending a user stops their keys at once; changing or resetting their password revokes them.

## Errors

Failures are JSON `{ "error": "...", "code"?: "..." }` with a status:

| Status | `code` | Meaning |
|---|---|---|
| 400 | `invalid` | Bad body, path or file type |
| 401 | | No or invalid key or session |
| 403 | `forbidden` | Read-only key, read-only share, or not the owner |
| 404 | `not_found` | No such page, or not shared with you (the same answer, on purpose) |
| 409 | `conflict` | The page changed since `expectedVersion`: read it again |
| 413 | `too_large` | Over a size limit |
| 413 | `quota` | Over the owner's storage or page quota (`GET /api/me` shows usage) |
| 429 | `rate_limited` | Too many changes; wait a minute (`Retry-After`) |

## Endpoints

| Method and path | Does |
|---|---|
| `GET /api/me` | Who the key belongs to, its actions, usage and quota, the server version |
| `GET /api/guide` | How to write pages (Markdown), with the allowed hosts and limits |
| `GET /api/pages?q=` | Pages you own or that are shared with you, newest change first |
| `POST /api/pages` | Create a page |
| `GET /api/pages/{id}?version=` | Details, files and warnings for the current or a given version |
| `PATCH /api/pages/{id}` | `{ title?, description? }` (owner) |
| `DELETE /api/pages/{id}` | Delete with every version and share (owner) |
| `GET /api/pages/{id}/files/{path}?version=` | One file as JSON: `text`, or `base64` for binary files |
| `GET /api/pages/{id}/versions` | Every version, newest first |
| `POST /api/pages/{id}/versions` | Save a new version |
| `POST /api/pages/{id}/restore` | `{ version, expectedVersion }`: copy an old version forward |

A page summary is `{ id, title, description, access, version, updatedAt, url }`, where `access` is
`owner`, `write` or `read` and `url` opens it in the browser. `GET /api/pages/{id}` adds
`shownVersion`, `files: [{ path, size }]` and `warnings` (references to hosts pages may not load).

Files are never served raw by the API: page code runs only in the sandboxed viewer.

### Creating and changing pages

Bodies are JSON (`Content-Type: application/json`). Each file has a `path` and exactly one of
`text` (UTF-8) or `base64`:

```sh
curl -s https://hatcher.example/api/pages \
  -H "Authorization: Bearer $HATCHER_API_KEY" -H 'Content-Type: application/json' \
  -d '{"title":"Hello","files":[{"path":"index.html","text":"<!doctype html><h1>Hi</h1>"}]}'
```

A new version names the version it is based on and lists the files to add or replace and the paths
to delete; everything else carries over:

```sh
curl -s https://hatcher.example/api/pages/AbC123xYz789/versions \
  -H "Authorization: Bearer $HATCHER_API_KEY" -H 'Content-Type: application/json' \
  -d '{"expectedVersion":1,"files":[{"path":"data.json","text":"[1,2,3]"}],"delete":["old.css"],"note":"New data"}'
```

The browser forms send the same endpoints `multipart/form-data` instead: `title`, `description`,
`note`, `expectedVersion`, `html` (index.html as text), `files` parts named by their path, and
`delete`.

Sharing stays in the web UI (`/p/{id}/manage`).
