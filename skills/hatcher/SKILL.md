---
name: hatcher
description: Publish and update private, shareable HTML pages (like artifacts) on a self-hosted Hatcher server through the hatcher MCP server. Use when asked to put something on Hatcher, make a page, chart, demo or interactive explainer the user can open and share, or change an existing Hatcher page.
---

# Working with Hatcher

Hatcher hosts HTML pages, like artifacts, on the user's own server. Each page is private to its
owner until they share it, and every change is a new version. You work through the `hatcher` MCP
server's tools; sharing and deleting are left to the user in the web UI.

## Before anything else

Call `guide` once per task. It says what your key may do, which CDN hosts pages may load from
right now, and the page format. Do not assume a host is allowed because it was last time.

## Workflow

1. **Find.** `list_pages` (with `query`) to see if the page already exists. Prefer updating it over
   making a near-duplicate.
2. **Read before changing.** `get_page` returns `index.html`, the file list and `version`. Pass that
   `version` as `expected_version` to `update_page`. Use `read_file` for other files.
3. **Write.** `create_page` with a clear `title`, a one- or two-sentence `description`, and `files`
   (`index.html` plus anything it uses, as `{ path, text }` or `{ path, base64 }`). For changes,
   `update_page` with only the files that changed, `delete` for removed ones, and a short `note`.
4. **Check the result.** Fix anything in `warnings` (references to blocked hosts will not load).
   Give the user the page URL from the result.

## Rules the server enforces

- `index.html` is required and served as written. Make it a complete document that works at phone
  width and in dark mode.
- Pages may load only from their own files and the allowed CDN hosts, over HTTPS; they cannot send
  data anywhere. Pin library versions in CDN URLs. Storage (cookies, localStorage) does not persist.
- Limits: 300 files and 50 MB per page, 10 MB per file, 6 folders deep; file names of letters,
  digits, spaces, `.`, `_`, `-`.

## Errors

Tool errors are JSON with a `code`:

| Code | Do |
|------|----|
| `invalid` | Fix what the message says and retry |
| `conflict` | The page changed: `get_page` again, merge your change, retry with the new version |
| `forbidden` | The key is read-only or the page is shared with you read-only; tell the user |
| `not_found` | Wrong id, or not shared with this account; check with `list_pages` |
| `too_large` | Shrink or split files |

If the `hatcher` tools are missing or every call fails with 401, the API key is not set: see
"Connecting an agent" in Hatcher's `docs/mcp.md` (`HATCHER_API_KEY`).
