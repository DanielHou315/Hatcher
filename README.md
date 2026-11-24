# Hatcher

A self-hosted, shareable alternative to Claude artifacts. Agents publish HTML pages to it through
its API, or you paste and upload them; each page is private until you share it with other accounts, to view
or to edit, and every change is kept as a version. Everything lives on your server: two SQLite
files and a folder.

Named after the Hatcher Graduate Library at the University of Michigan.

- **Pages** are HTML with any files they need, shown full-window in a sandboxed frame. They may load
  libraries from CDN hosts an admin allows (jsDelivr, cdnjs, unpkg, esm.sh, Google Fonts… by
  default) and nothing else. See [docs/pages.md](docs/pages.md).
- **Sharing**: per page, with other accounts, view or edit.
- **Versions**: every change is a new version; view or restore any of them.
- **Accounts**: registration open, limited to email domains, or closed; authenticator-app two-factor
  sign-in; password reset, confirmation and share emails through your SMTP server; per-user
  quotas; an admin page for users and settings. Admins cannot open pages that are not shared with
  them.
- **Agents**: a REST API with per-user keys ([docs/api.md](docs/api.md)), and an
  [agent plugin](https://github.com/DanielHou315/hatcher-client-plugin) with an MCP server and a
  skill for Claude Code, Codex, Cursor and other MCP clients.

## Run it with Docker

Hatcher is one container. Everything it stores (accounts, pages, settings) goes in `/app/data`;
mount a host folder there and back it up. The container runs as uid 1000, which must be able to
write that folder.

1. Make a folder and a settings file:

   ```sh
   mkdir -p hatcher/data && cd hatcher
   cat > .env <<EOF
   BETTER_AUTH_SECRET=$(openssl rand -base64 32)
   BETTER_AUTH_URL=http://localhost:3000
   HATCHER_ADMIN_EMAILS=you@example.com
   EOF
   ```

   `BETTER_AUTH_URL` is the address people open; sign-in is refused from any other address unless
   it is in `HATCHER_TRUSTED_ORIGINS`. See [Configuration](#configuration) for the rest.

2. Start it, from a release image:

   ```sh
   docker run -d --name hatcher --restart unless-stopped \
     -p 3000:3000 -v "$PWD/data:/app/data" --env-file .env \
     ghcr.io/danielhou315/hatcher:0.3.0
   ```

   or with Compose, in a `docker-compose.yml` next to `.env`:

   ```yaml
   services:
     hatcher:
       image: ghcr.io/danielhou315/hatcher:0.3.0
       ports: ["3000:3000"]
       volumes: ["./data:/app/data"]
       env_file: .env
       restart: unless-stopped
   ```

   ```sh
   docker compose up -d
   ```

   To build from this repository instead: `cp .env.example .env`, fill it in, and
   `docker compose up -d --build` (its `docker-compose.yml` builds the image and stores data in
   `./data`, or in `DATA_DIR`).

3. Open the site and register with the email from `HATCHER_ADMIN_EMAILS`. You become the admin; that
   setting does nothing more once an admin exists, so you can remove it.

4. At `/account`, turn on two-factor sign-in. At `/admin`, set up email (SMTP) if you want password
   resets and invitations, choose who may register (closed at first), and check the quotas.

Everyday commands:

```sh
docker logs -f hatcher                           # Compose: docker compose logs -f
docker restart hatcher                           # Compose: docker compose restart
docker compose pull && docker compose up -d      # after moving to a newer image tag
docker stop hatcher && docker rm hatcher         # stop and remove; data stays in ./data
```

With `docker run`, changes to `.env` (and a new image tag) need the container removed and started
again with the same command; with Compose, `docker compose up -d` does that.

Behind a reverse proxy (Caddy, nginx, Cloudflare Tunnel), proxy everything to port 3000, set
`BETTER_AUTH_URL` to the public `https://` address, and set `HATCHER_CLIENT_IP_HEADER` to the header
your proxy sets with the visitor's address (`cf-connecting-ip` behind Cloudflare).

## Configuration

Set in `.env` (Docker) or the environment. [`.env.example`](.env.example) lists them all.

| Variable | |
|---|---|
| `BETTER_AUTH_SECRET` | **Required.** Signs sessions and frame tokens and encrypts the SMTP password; at least 32 characters (`openssl rand -base64 32`). Changing it signs everyone out. |
| `BETTER_AUTH_URL` | **Required.** The URL people open. Email links and API results point at it. |
| `HATCHER_ADMIN_EMAILS` | Emails that may register as admins while no admin exists. |
| `HATCHER_TRUSTED_ORIGINS` | Other addresses the site is opened at, comma-separated, e.g. a LAN address. Plain-http ones only work while `BETTER_AUTH_URL` is http too. |
| `HATCHER_CLIENT_IP_HEADER` | The header holding the visitor's address, for rate limits. Default `x-forwarded-for`; use one your proxy overwrites. |
| `CONTENT_ORIGIN`, `SITE_ORIGIN` | Optional: serve page files from a second hostname proxied to the same container. Only then can a page open in its own tab. |
| `GITHUB_CLIENT_ID`/`_SECRET`, `GOOGLE_CLIENT_ID`/`_SECRET` | Optional OAuth sign-in. Callback: `<BETTER_AUTH_URL>/api/auth/callback/github` (or `google`). |
| `DATA_DIR` | Where data is stored. The image uses `/app/data`; mount over it rather than changing it. |

Everything else is set by an admin at `/admin`: registration (open, by email domain, or closed),
SMTP, which CDN hosts pages may load from, and storage and page quotas (default 1 GB and 500 pages
a person, with per-user limits under Users).

## Use it from agents

1. On your Hatcher site, open **Account → API keys** and create a key: **read and write** to publish,
   **read** to only look.
2. Make the site and key available where your agent runs, for example in your shell profile:

   ```sh
   export HATCHER_URL=https://hatcher.example.com
   export HATCHER_API_KEY=hk_...
   export HATCHER_ALLOW_HTTP=1    # only for a plain-http address other than localhost (LAN, VPN)
   ```

3. Install the plugin, which brings the `hatcher` MCP server and a skill on how to write pages:

   ```sh
   # Claude Code
   claude plugin marketplace add DanielHou315/hatcher-client-plugin
   claude plugin install hatcher@hatcher

   # Codex
   codex plugin marketplace add DanielHou315/hatcher-client-plugin
   codex plugin add hatcher@hatcher
   ```

   Cursor, opencode, pi and other MCP clients: see the
   [plugin's README](https://github.com/DanielHou315/hatcher-client-plugin#installation).

4. Restart the agent and ask it to "call the hatcher guide tool": it answers with the site and
   account it is connected as. Then ask for a page ("publish this analysis as a Hatcher page");
   the agent creates it and gives you the link. Pages are private until you share them from the
   page's **Share & edit** screen.

Scripts can call the REST API directly with the same key; see [docs/api.md](docs/api.md).

## Development

Needs Node.js 24 (for `node:sqlite`).

```sh
cp .envrc.example .envrc && direnv allow   # or export the same variables yourself
npm install
npm run dev                                # http://localhost:3000
npm test && npm run lint                   # before a PR
npm run build && npm start                 # production build
```

`npm run import-page -- --owner you@example.com --title "Title" <folder | file.html>` imports a page
from disk into `DATA_DIR`.

More: [docs/deployment.md](docs/deployment.md) (releases, upgrading),
[docs/architecture.md](docs/architecture.md) (how it works, the sandbox, limits),
[docs/api.md](docs/api.md) (REST API), [docs/pages.md](docs/pages.md) (writing pages),
[CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE). Hatcher's dependencies are under permissive licences (MIT, ISC, Apache-2.0, BSD),
plus the SIL Open Font License for its fonts. The Docker image also carries libvips (LGPL-3.0, from
Next.js's optional `sharp`) unmodified as a separate library.
