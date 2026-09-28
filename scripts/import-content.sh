#!/usr/bin/env bash
# Copy the live content directory back into the repo's content/ so new or edited pages can be
# reviewed, promoted, and committed through a PR. Files only in content/ are left alone.
set -euo pipefail

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
content=${CONTENT_DIR:-}

if [[ -z "$content" ]]; then
  echo "CONTENT_DIR is not set; nothing to import." >&2
  exit 64
fi
if [[ "$(realpath -m "$content")" == "$(realpath "$repo/content")" ]]; then
  echo "CONTENT_DIR is the repo's own content/; nothing to import."
  exit 0
fi
if [[ ! -d "$content" ]]; then
  echo "$content does not exist." >&2
  exit 66
fi

cp -a "$content/." "$repo/content/"

changes=$(git -C "$repo" status --short --untracked-files=all -- content)
if [[ -z "$changes" ]]; then
  echo "Imported $content: no changes."
else
  echo "Imported $content. Changes in content/:"
  echo "$changes"
  echo
  echo "Pages the agent wrote are status: draft and stay drafts until you set status: ready."
  echo "Review them, run npm run validate:content, and commit on a branch through a PR."
fi
