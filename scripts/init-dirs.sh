#!/usr/bin/env bash
# Create the live content, data and agent directories so Docker does not create them as root.
# Content is service data and is never committed; back it up with the rest of $HATCHER_HOME.
set -euo pipefail

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
mkdir -p "${CONTENT_DIR:-$repo/content}" "${DATA_DIR:-$repo/data}" "${AGENT_DIR:-$repo/data/agent}"
