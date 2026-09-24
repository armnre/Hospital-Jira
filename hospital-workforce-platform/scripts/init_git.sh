#!/usr/bin/env bash
# HWDT — initialise the Git repository (idempotent) and verify no secrets are staged.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -d .git ]]; then
  git init -q -b main
  echo "Initialised Git repository in ${ROOT}"
fi
git config user.name  >/dev/null 2>&1 || git config user.name  "HWDT Platform Engineering"
git config user.email >/dev/null 2>&1 || git config user.email "platform@hwdt.local"
# Enforce "HWDT-XXX: description" commit messages (Jira traceability)
git config core.hooksPath scripts/git-hooks

git add -A
if git diff --cached --name-only | grep -Eq '(^|/)\.env$|\.(pem|key|crt|dump)$'; then
  echo "ERROR: secret or backup file staged — check .gitignore" >&2
  git diff --cached --name-only | grep -E '(^|/)\.env$|\.(pem|key|crt|dump)$' >&2
  exit 1
fi
if git diff --cached --quiet; then
  echo "Nothing to commit"
else
  git commit -q -m "${1:-HWDT-1: infrastructure foundation update}"
  echo "Committed: $(git log --oneline -1)"
fi
git log --oneline | head -5
