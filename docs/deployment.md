# Deployment

`docker compose up -d` runs two services: `site` (the reading site) and `agent` (Claude Code with
the paper-to-guided-learning plugin, on a timer). The agent writes draft pages into the live
content directory, and the site shows them without a restart.

## Layout

Live data lives outside the repo:

```
~/Databases/marginalia/
  content/     MDX the site serves (read-only in `site`, read-write in `agent`)
  database/    progress.db (SQLite)
  agent/       queue.md, logs/, claude/ (Claude Code config), uv-cache/, p2gl-cache/, workspace/
```

The repo's `content/` stays the committed seed and curriculum. The live directory is seeded from
it once, and agent pages are imported back into it for review and commit.

## Environment

Copy `.envrc.example` to `.envrc` and `direnv allow`. Every variable is documented there:
`MARGINALIA_HOME`, `CONTENT_DIR`, `DATA_DIR`, `AGENT_DIR`, `PLUGIN_DIR` (the plugin checkout,
mounted read-only), `PORT`, `CHOKIDAR_USEPOLLING`, `CLAUDE_CODE_OAUTH_TOKEN`, `AGENT_SCHEDULE`
(cron, in `AGENT_TZ`), `AGENT_TZ`, `AGENT_MAX_TURNS`, `AGENT_MODEL`, and the optional
`XAI_API_KEY` and `S2_API_KEY`. Without the variables, compose falls back to `./content`,
`./data`, `./data/agent`, and `../paper-to-guided-learning-plugin`.

Get the token on the host with `claude setup-token` and put it in `.envrc`. It reaches the
container as an environment variable only; it is not in the image. `docker compose config`
prints resolved values, so do not paste its output anywhere.

## First start

```sh
npm run docker:up        # bash scripts/seed-content.sh && docker compose up -d --build
```

`scripts/seed-content.sh` creates the three directories (so Docker does not create them as root)
and copies `content/` into `CONTENT_DIR` only if it is empty; `--force` copies over it. The agent
refuses to start without a token.

## Queue

`$AGENT_DIR/queue.md` is created from `agent/queue.example.md` on first start. Each run takes the
first `- [ ]` line:

| Line | Job |
|---|---|
| `- [ ] paper 2303.16852` | decompose that arXiv paper (`paper-decompose` skill) |
| `- [ ] concept <slug>` | write that concept page (`lesson-author`) |
| `- [ ] topic <words>` | scout the topic, decompose the best paper not on the site (`paper-scout`, `paper-decompose`) |
| `- [ ] roadmap` | place unplaced pages and report gaps (`roadmap-curator`) |

A success becomes `- [x] ... (date)`, a failure `- [!] ... (date: failed, see <log>)`; failed
jobs are not retried. With no open line, the run writes the first missing prerequisite reported by
`p2gl catalog --gaps`, or does nothing. A run succeeds when Claude exits cleanly and
`p2gl catalog --check` passes over the whole content directory. The prompts are in `agent/prompts/`.

## Logs

- `$AGENT_DIR/logs/<UTC time>-<kind>.log`: the run's full log; `.json` next to it is Claude's
  result (turns, cost, final message).
- `$AGENT_DIR/logs/history.tsv`: one line per run (time, kind, subject, exit code, files changed,
  duration).
- `npm run agent:logs`: the container's output (startup, scheduler, runs).

## Testing a run

```sh
npm run agent:dry-run    # everything except calling Claude; prints the prompt; queue unchanged
npm run agent:run-now    # one real run of the next job, now
```

Setting `AGENT_RUN_NOW=1` when starting the service runs one job before the scheduler starts.

## Promoting pages

Agent pages always have `status: draft`. To keep one:

```sh
npm run content:import   # copy CONTENT_DIR into content/ and list what changed
```

Review the pages on a branch, fix them, set `status: ready`, run `npm run validate:content`, and
merge through a PR. Import never deletes files from `content/`.

## Updating

- Site or agent code: `npm run docker:up` rebuilds both images.
- Claude Code: set `CLAUDE_CODE_VERSION` in `agent/Dockerfile` to the version `claude --version`
  shows on the host, then rebuild. The auto-updater is off in the container.
- Plugin: pull the plugin checkout; the agent syncs its environment on every start
  (`docker compose restart agent`).

## Cost and permissions

Each run is a headless Claude Code session billed to the token's account, bounded by
`AGENT_MAX_TURNS` and a two-hour timeout; the result JSON records its cost. The agent runs with
`--permission-mode bypassPermissions`, which is acceptable only because it runs as uid 1000 in a
container whose writable mounts are the content and agent directories (the plugin is
read-only). It has network access, and it can edit any file in the live content, so review
imports before committing them.
