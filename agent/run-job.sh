#!/usr/bin/env bash
# One scheduled run: take the first open job from /data/agent/queue.md (or fill a prerequisite
# gap), run Claude Code on it headless, validate the content, and record the outcome.
#
#   run-job.sh            run the next job
#   run-job.sh --dry-run  everything except invoking claude; the queue is left unchanged
set -euo pipefail

AGENT_HOME=/data/agent
CONTENT=${LEARNING_CONTENT_DIR:-/data/content}
APP=/app/agent
QUEUE=$AGENT_HOME/queue.md
LOGS=$AGENT_HOME/logs
WORKSPACE=$AGENT_HOME/workspace
MAX_TURNS=${AGENT_MAX_TURNS:-80}

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "usage: run-job.sh [--dry-run]" >&2; exit 64 ;;
  esac
done

mkdir -p "$LOGS" "$WORKSPACE"

# One run at a time (a manual run may coincide with the schedule).
exec 9>"$AGENT_HOME/.run.lock"
if ! flock -n 9; then
  echo "another run is in progress; skipping"
  exit 0
fi

# --- pick the job ------------------------------------------------------------------------------
# Queue lines look like "- [ ] <kind> <subject>". The first unchecked line wins.
KIND="" SUBJECT="" QUEUE_LINE="" NEEDED_BY=""
if [[ -f "$QUEUE" ]]; then
  QUEUE_LINE=$(grep -m1 -E '^- \[ \] ' "$QUEUE" || true)
fi
if [[ -n "$QUEUE_LINE" ]]; then
  rest=${QUEUE_LINE#- \[ \] }
  KIND=${rest%% *}
  SUBJECT=""
  [[ "$rest" == *" "* ]] && SUBJECT=${rest#* }
else
  # Gap fill: the first slug that some page lists as a prerequisite but that has no page.
  gap=$(p2gl catalog --gaps --json --content-dir "$CONTENT" 2>/dev/null | python3 -c '
import json, sys
missing = json.load(sys.stdin)["gaps"]["missing_prerequisites"]
for slug, users in missing.items():
    print(slug + "\t" + ", ".join(users))
    break
')
  if [[ -z "$gap" ]]; then
    echo "queue empty and no prerequisite gaps: nothing to do"
    exit 0
  fi
  KIND=gap
  SUBJECT=${gap%%$'\t'*}
  NEEDED_BY=${gap#*$'\t'}
fi

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
suffix=$KIND
[[ $DRY_RUN == 1 ]] && suffix=$KIND-dry-run
LOG=$LOGS/$STAMP-$suffix.log
JSON=${LOG%.log}.json
exec > >(tee -a "$LOG") 2>&1
TEE_PID=$!
MARKER=""
# Let tee flush the log before the script exits.
trap 'rm -f "$MARKER"; exec >&- 2>&-; wait "$TEE_PID" 2>/dev/null || true' EXIT

START=$(date +%s)
echo "== $STAMP job: $KIND ${SUBJECT:-(no subject)}${QUEUE_LINE:+ (queue: $QUEUE_LINE)}"

# Replace the queue line with its done/failed form; match the exact line, not a line number,
# so edits made to the queue during the run are kept.
mark_queue() {
  local status=$1 note=$2
  [[ -n "$QUEUE_LINE" && $DRY_RUN == 0 ]] || return 0
  python3 - "$QUEUE" "$QUEUE_LINE" "$status" "$note" <<'PY'
import sys
path, line, status, note = sys.argv[1:]
text = open(path, encoding="utf-8").read().split("\n")
for i, current in enumerate(text):
    if current == line:
        text[i] = "- [" + status + "] " + line[len("- [ ] "):] + " (" + note + ")"
        break
open(path, "w", encoding="utf-8").write("\n".join(text))
PY
}

record() {
  local code=$1 changed=$2
  local duration=$(( $(date +%s) - START ))
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$STAMP" "$suffix" "${SUBJECT:--}" "$code" "$changed" "${duration}s" \
    >> "$LOGS/history.tsv"
}

case "$KIND" in
  paper|concept|topic|gap) [[ -n "$SUBJECT" ]] || { echo "job '$KIND' needs a subject"; mark_queue "!" "$(date +%F): failed, missing subject"; record 64 0; exit 64; } ;;
  roadmap) ;;
  *)
    echo "unknown job kind '$KIND' (expected paper, concept, topic, or roadmap)"
    mark_queue "!" "$(date +%F): failed, unknown job kind"
    record 64 0
    exit 64
    ;;
esac

# --- build the prompt --------------------------------------------------------------------------
PROMPT=$(python3 - "$APP/prompts/$KIND.md" "$SUBJECT" "$NEEDED_BY" <<'PY'
import sys
path, subject, needed_by = sys.argv[1:]
text = open(path, encoding="utf-8").read()
print(text.replace("{{subject}}", subject).replace("{{needed_by}}", needed_by or "unknown"), end="")
PY
)

cmd=(claude -p "$PROMPT" --plugin-dir /plugin --add-dir "$CONTENT"
     --permission-mode bypassPermissions --max-turns "$MAX_TURNS" --output-format json)
[[ -n "${AGENT_MODEL:-}" ]] && cmd+=(--model "$AGENT_MODEL")

MARKER=$(mktemp "$AGENT_HOME/.run-start.XXXXXX")

# --- run ---------------------------------------------------------------------------------------
claude_code=0
if [[ $DRY_RUN == 1 ]]; then
  echo "-- dry run: prompt"
  printf '%s\n' "$PROMPT"
  echo "-- dry run: command (cwd $WORKSPACE, timeout 2h)"
  printf '%q ' "${cmd[@]:0:2}"; printf '<prompt> '; printf '%q ' "${cmd[@]:3}"; echo
else
  echo "-- claude (max turns $MAX_TURNS${AGENT_MODEL:+, model $AGENT_MODEL}); result in $JSON"
  (cd "$WORKSPACE" && timeout 2h "${cmd[@]}") > "$JSON" || claude_code=$?
  # A run that stops on max turns or an API error can still exit 0; trust the result's flag.
  if [[ $claude_code == 0 ]] && ! python3 -c '
import json, sys
result = json.load(open(sys.argv[1]))
sys.exit(1 if result.get("is_error") else 0)' "$JSON" 2>/dev/null; then
    claude_code=1
  fi
  python3 -c '
import json, sys
r = json.load(open(sys.argv[1]))
print("subtype:", r.get("subtype"), "| turns:", r.get("num_turns"), "| cost usd:", r.get("total_cost_usd"))
print(r.get("result") or "")' "$JSON" 2>/dev/null || echo "(no readable JSON result)"
  echo "-- claude exit code: $claude_code"
fi

# --- validate and record -----------------------------------------------------------------------
echo "-- p2gl catalog --check"
check_code=0
p2gl catalog --check --content-dir "$CONTENT" || check_code=$?
echo "-- catalog check exit code: $check_code"

mapfile -t changed < <(find "$CONTENT" -type f -newer "$MARKER" | sort)
echo "-- files changed in $CONTENT during the run: ${#changed[@]}"
if (( ${#changed[@]} )); then printf '   %s\n' "${changed[@]}"; fi

code=0
if [[ $claude_code != 0 ]]; then code=$claude_code; elif [[ $check_code != 0 ]]; then code=$check_code; fi

today=$(date +%F)
if [[ $code == 0 ]]; then
  mark_queue x "$today"
else
  mark_queue "!" "$today: failed, see $(basename "$LOG")"
fi
record "$code" "${#changed[@]}"
echo "== done: exit $code in $(( $(date +%s) - START ))s"
exit "$code"
