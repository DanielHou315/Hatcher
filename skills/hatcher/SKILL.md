---
name: hatcher
description: Read, write, validate and publish pages on a Hatcher reading site (concept, paper and roadmap pages in MDX or sandboxed HTML) through the hatcher MCP server. Use when asked to add, edit, review, fix or publish Hatcher pages, or to check what the site already covers.
---

# Working with Hatcher

Hatcher is a reading site of **concept**, **paper** and **roadmap** pages. Pages are stored on the
server; you change them only through the `hatcher` MCP server's tools. The server validates every
write and refuses pages that break its rules, so rely on its answers rather than guessing.

## Before anything else

Call `guide` once per task. It returns what your API key may do (read, write, publish) and the
full page format reference, which is the source of truth for frontmatter, summaries, tags, levels, section
structure and components. Do not write from memory of an older format.

## Workflow

1. **Survey.** `list_pages` (filter by `kind`, `status`, `query`) to find related pages and avoid
   duplicates. Slugs are unique across all kinds.
2. **Read before changing.** `get_page` returns the source, the file list and a `version`.
   Changing or deleting an existing page requires that `version` as `expected_version`. Use
   `read_file` for figures and assets.
3. **Check.** `validate_page` takes the same arguments as `write_page` and saves nothing. Fix every
   error it reports; treat warnings as advice.
4. **Write.** `write_page` with the files to create or replace (`{ path, text }`, or
   `{ path, base64 }` for binary) and any `delete` paths. A page is a folder: `index.mdx` or
   `index.html`, plus figures and assets beside it. Writing `index.html` replaces `index.mdx`.
5. **Publish** only when asked and only with a publish key: `set_status` to `ready`. Otherwise
   leave `status: draft` and say the page is ready for review.

## Rules the server enforces

- **No JavaScript in MDX.** No `import`/`export`, no `{expressions}`, no `<script>`, `<iframe>`,
  `<style>`, `<form>`, `<svg>`, no `on*` attributes, no `javascript:` or `data:` URLs. Braces
  belong in math (`$\{x\}$`) or code. Anything interactive goes in a `<Figure src="figures/x.html">`
  or an HTML page; both run in a sandbox.
- **Sandboxed HTML loads only from the page folder.** Copy libraries and data into the folder;
  references to other hosts are errors. The sandbox has no network access beyond the site, no
  cookies and no storage.
- **Drafts.** Without publish access, written pages must say `status: draft`, and published pages
  cannot be changed or deleted. Ask the user for an admin key if a published page needs fixing.
- **Limits.** 200 files and 10 MB per page, 2 MB per file, folders 4 levels deep, file names of
  letters, digits, `.`, `_`, `-`.

## Errors

Tool errors are JSON with a `code`:

| Code | Do |
|------|----|
| `invalid` | Fix the listed `errors` and retry |
| `conflict` | The page changed or already exists: `get_page` again, merge your change, retry with the new version |
| `forbidden` | The key lacks access; tell the user which access is needed |
| `not_found` | Check kind and slug with `list_pages` |
| `too_large` | Shrink or split assets |

If the `hatcher` tools are missing or every call fails with 401, the API key is not set: see
"Connecting an agent" in Hatcher's `docs/mcp.md` (`HATCHER_API_KEY`).
