#!/usr/bin/env bash
# Container entrypoint: prepare /data/agent, install the plugin's helper, then either run the
# given command (for one-off `docker compose run ... /app/agent/run-job.sh`) or start the
# scheduler.
set -euo pipefail

AGENT_HOME=/data/agent
APP=/app/agent

log() { printf '[entrypoint %s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

# 1. Credentials. A dry run never calls Claude, so it may run without them.
if [[ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" && -z "${ANTHROPIC_API_KEY:-}" ]]; then
  case " $* " in
    *" --dry-run "*) log "no CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY; continuing because of --dry-run" ;;
    *)
      log "error: CLAUDE_CODE_OAUTH_TOKEN (or ANTHROPIC_API_KEY) is not set."
      log "Run \`claude setup-token\` on the host, export the token in .envrc, and restart."
      exit 64
      ;;
  esac
fi

# 2. Agent-owned directories.
mkdir -p "$AGENT_HOME"/{logs,claude,p2gl-cache,uv-cache,workspace}

# 3. The p2gl helper. /plugin is read-only; the venv lives in UV_PROJECT_ENVIRONMENT.
if [[ ! -f /plugin/pyproject.toml ]]; then
  log "error: /plugin/pyproject.toml not found; is PLUGIN_DIR set to the plugin checkout?"
  exit 66
fi
log "uv sync --project /plugin --frozen"
uv sync --project /plugin --frozen --no-dev
log "p2gl --help (head):"
{ p2gl --help 2>&1 || true; } | head -n 6
log "claude: $(claude --version 2>&1)"

# 4. Queue.
if [[ ! -f "$AGENT_HOME/queue.md" ]]; then
  cp "$APP/queue.example.md" "$AGENT_HOME/queue.md"
  log "created $AGENT_HOME/queue.md from the example queue"
fi

# 5. The CLAUDE.md the agent sees (always refreshed from the image).
cp "$APP/CLAUDE.workspace.md" "$AGENT_HOME/workspace/CLAUDE.md"

# One-off command, for example `docker compose run --rm agent /app/agent/run-job.sh --dry-run`.
if [[ $# -gt 0 ]]; then
  exec "$@"
fi

# 6. Scheduler.
if [[ "${AGENT_RUN_NOW:-0}" == "1" ]]; then
  log "AGENT_RUN_NOW=1: running one job before starting the scheduler"
  "$APP/run-job.sh" || log "startup job exited with $?"
fi

schedule="${AGENT_SCHEDULE:-0 6 * * *}"
crontab=/home/agent/crontab
printf '%s %s\n' "$schedule" "$APP/run-job.sh" > "$crontab"
log "schedule: '$schedule' (TZ=${TZ:-UTC})"
# tini is PID 1 and reaps children, so supercronic does not need to.
exec supercronic -no-reap -passthrough-logs "$crontab"
