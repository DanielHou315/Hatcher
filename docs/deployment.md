# Deployment

`docker compose up -d` runs Hatcher. It needs `BETTER_AUTH_SECRET` and one directory for data.

## Layout

```
~/Databases/hatcher/database/     DATA_DIR: auth.db, hatcher.db, pages/
```

Back it up as a whole. The repo holds no data.

## Environment

Copy `.envrc.example` to `.envrc` and `direnv allow`; every variable is documented there. The
essentials:

- `BETTER_AUTH_SECRET`: `openssl rand -base64 32`. It signs sessions and frame tokens and encrypts the
  SMTP password; changing it signs everyone out.
- `BETTER_AUTH_URL`: the URL people open, e.g. `https://hatcher.example.com`. Sign-in only works from
  this origin, and email links point at it.
- `HATCHER_ADMIN_EMAILS`: your email, so you can register as the first admin.

`docker compose config` prints resolved values, secrets included, so do not paste its output
anywhere.

## First start

1. `npm run docker:up`, then open the site and register with an email from `HATCHER_ADMIN_EMAILS`.
2. At `/account`, turn on two-factor sign-in.
3. At `/admin`, set up email (SMTP) if you want password resets, then choose who may register.
   Registration starts closed.
4. Create an API key at `/account` for your agents (`docs/mcp.md`).

## Upgrading from 0.1

0.2 replaces the reading library with private pages. Accounts and API keys carry over (keys with
"publish" access become read-and-write). `CONTENT_DIR` and `progress.db` are no longer used; import
an old HTML page with `npm run import-page` (see `scripts/import-page.ts`), then delete them.

## Releases

Merges to `main` run CI (lint, tests, build, and a Docker build). To release:

1. Bump `version` in `package.json` (and `package-lock.json`) and add a `## [X.Y.Z] - date` section to
   `CHANGELOG.md`, in a PR.
2. After it merges, tag main and push the tag:

   ```sh
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```

The release workflow checks the tag against `package.json` and the changelog, runs the tests,
pushes `ghcr.io/danielhou315/hatcher:X.Y.Z`, `:X.Y` and `:latest`, and creates a GitHub release
with the changelog section as notes. Deployments pin `X.Y.Z` and move to a new release
deliberately. While the repository is private, the server needs `docker login ghcr.io` with a
token that has `read:packages`.

## Updating

From source: `npm run docker:up` rebuilds the image. From a release: change the pinned tag and
`docker compose pull && docker compose up -d`.
