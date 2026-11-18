# Deployment

`docker compose up -d` runs the reading site. Pages written into the live content directory show
up without a restart.

## Layout

Live data lives outside the repo:

```
~/Databases/hatcher/
  content/     MDX the site serves (mounted read-only)
  database/    progress.db (SQLite)
```

Content is service data only; the repo holds no pages. Back up `~/Databases/hatcher/` as a whole.

## Environment

Copy `.envrc.example` to `.envrc` and `direnv allow`; every variable is documented there. Without
the variables, compose falls back to `./content` and `./data`. `docker compose config` prints
resolved values, secrets included, so do not paste its output anywhere.

## First start

```sh
npm run docker:up        # bash scripts/init-dirs.sh && docker compose up -d --build
```

`scripts/init-dirs.sh` creates the directories so Docker does not create them as root.

## Publishing drafts

Pages with `status: draft` are hidden from the public site; editors see them in the studio. To
publish one, review it, set `status: ready` in `CONTENT_DIR`, and run `npm run validate:content`.

## Updating

`npm run docker:up` rebuilds the image.
