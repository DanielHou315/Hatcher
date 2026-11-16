#!/usr/bin/env bash
# Seed the live content directory from the repo's committed content/, and create the data and
# agent directories so Docker does not create them as root.
#
#   bash scripts/seed-content.sh           copy only when $CONTENT_DIR is missing or empty
#   bash scripts/seed-content.sh --force   copy over a non-empty $CONTENT_DIR (overwrites same-named files)
set -euo pipefail

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
force=0
case "${1:-}" in
  "") ;;
  --force) force=1 ;;
  *) echo "usage: seed-content.sh [--force]" >&2; exit 64 ;;
esac

content=${CONTENT_DIR:-$repo/content}
data=${DATA_DIR:-$repo/data}
agent=${AGENT_DIR:-$repo/data/agent}

mkdir -p "$data" "$agent"

if [[ "$(realpath -m "$content")" == "$(realpath "$repo/content")" ]]; then
  echo "CONTENT_DIR is the repo's own content/; nothing to seed."
  exit 0
fi

mkdir -p "$content"
if [[ -n "$(ls -A "$content")" && $force == 0 ]]; then
  echo "$content is not empty; leaving it alone (use --force to copy the seed over it)."
  exit 0
fi

cp -a "$repo/content/." "$content/"
count=$(find "$repo/content" -type f | wc -l)
echo "Seeded $content with $count files from $repo/content."
