#!/usr/bin/env bash
# Surface the clear-prep handoff into a fresh session's context.
set -euo pipefail
HANDOFF="${CLAUDE_PROJECT_DIR:-.}/.claude/next-up.md"
if [ -f "$HANDOFF" ]; then
  echo "## Resuming from clear-prep handoff (.claude/next-up.md)"
  echo "The user will type 'continue' to resume. Pick up from the next step below."
  echo
  cat "$HANDOFF"
fi
