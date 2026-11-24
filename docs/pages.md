# Writing pages

A Hatcher page is a web page: an `index.html` plus any files it uses (scripts, styles, images, fonts,
data). Agents publish them over MCP; people paste or upload them at `/new`. Every page is private to
its owner until shared, and every change is a new version.

## The page

- `index.html` is required. Write a complete document (`<!doctype html>`, `<meta charset>`,
  `<meta name="viewport">`); it is served exactly as written, nothing is injected.
- Other files sit beside it and are referenced by relative paths: `<script src="app.js">`,
  `fetch('data/points.json')`, `<img src="img/figure.png">`. Folders are fine (`js/`, `data/`).
- File names: letters, digits, spaces, `.`, `_`, `-`; no leading dot; at most 6 folders deep.
- Served types: html, js, mjs, css, json, csv, tsv, txt, md, xml, svg, png, jpg, gif, webp, avif,
  ico, woff2, woff, ttf, otf, wasm, mp4, webm, mp3, wav, ogg, pdf, glb, gltf.
- Limits: 300 files and 50 MB per page, 10 MB per file.

## What a page may load

Pages run in a sandboxed frame with their own, opaque origin, so their code cannot reach the
Hatcher site, its cookies or the reader's account.

A page may load scripts, styles, fonts, images and data from:

- its own files, and
- the CDN hosts an admin allows (by default `cdnjs.cloudflare.com`, `cdn.jsdelivr.net`, `unpkg.com`,
  `esm.sh`, `cdn.tailwindcss.com`, `code.jquery.com`, `fonts.googleapis.com`, `fonts.gstatic.com`),
  over HTTPS.

Everything else is blocked by the browser: other hosts, APIs, analytics, and sending data anywhere.
The `guide` tool and the `/new` page list the hosts currently allowed, and MCP write results warn
about references to blocked hosts. Pin library versions in URLs (`d3@7.9.0`, not `d3`).

Inline scripts and styles, `eval`, WebAssembly, workers, `blob:` and `data:` URLs work. Cookies,
`localStorage` and IndexedDB do not persist (the origin is opaque), so keep state in memory.
Forms cannot submit anywhere; handle them in JavaScript. `alert` and `confirm` work.

## Example

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sine wave</title>
  <script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; }
    @media (prefers-color-scheme: dark) { body { background: #111; color: #eee; } }
  </style>
</head>
<body>
  <h1>Sine wave</h1>
  <svg id="plot" width="600" height="200"></svg>
  <script src="plot.js"></script>
</body>
</html>
```

## Good pages

- Work at phone width: the viewer shows the page full width under a thin bar.
- Respect `prefers-color-scheme` and `prefers-reduced-motion`.
- Animations need a working pause control; one `requestAnimationFrame` loop is easiest to get right.
- Give the page a title and a one- or two-sentence description: they are what lists show.
- When changing a page, change what was asked and keep the rest; the history keeps every version,
  and `restore_version` brings any of them back.
