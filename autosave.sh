#!/usr/bin/env bash
set -euo pipefail
if [ ! -d .git ]; then git init; fi
git add -A
NOW="$(date -u +'%Y-%m-%d %H:%M:%S UTC')"
git commit -m "autosave: ${NOW}" || echo "Nothing to commit"
