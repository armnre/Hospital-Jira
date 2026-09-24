#!/usr/bin/env bash
# HWDT — render a Control Center validation run (JSON from POST /api/validation/run) to Markdown.
# Usage: ./scripts/render_test_report.sh run.json > docs/phase0-test-report.md
set -euo pipefail
RUN_JSON="${1:?usage: render_test_report.sh <run.json>}"
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

echo "# HWDT Phase 0 — Sandbox Test Report"
echo
jq -r '"Run #\(.run.id) · \(.run.startedAt) · **\(.run.passed) passed, \(.run.failed) failed, \(.run.blocked) blocked** (blocked = requires a Docker daemon, which the build sandbox does not have)\n\nEnvironment: \(.run.environment)"' "$RUN_JSON"
echo
echo "| ID | Area | Test | Result | Details |"
echo "|---|---|---|---|---|"
jq -r '.results[] | "| \(.testId) | \(.category) | \(.name) | \(.status) | \(.details | gsub("\\|";"/")) |"' "$RUN_JSON"
cat <<'EOF'

## Errors found and fixes

| Error | Fix |
|---|---|
| `CREATE DATABASE confluence_db ... en_US.UTF-8` failed: locale missing on minimal hosts | Init script falls back to C.UTF-8 with a warning (the official postgres:15-bookworm image ships en_US.UTF-8) |
| Nginx would exit at boot when `jira`/`confluence` were not yet resolvable | Lazy DNS via `resolver 127.0.0.11` + variables; 503 page while upstream boots |
| Restored objects owned by the superuser | `pg_restore --no-owner --role=<app role>`; verified in RST-02 |
| **Found by the suite (run #2):** an in-place restore (`restore_database.sh latest:jira_db jira_db --force`) recreated jira_db with the server default collation `C.UTF-8` instead of Jira's required `C` (DB-03 failed) | `restore_database.sh` now captures encoding/collation of the existing target *before* dropping it (fallback: source DB, then per-application defaults); RST-02 now asserts collation `C` and table ownership after restore |
| Secret scanner false positive on empty `CONFLUENCE_LICENSE_KEY=` | Regex restricted to same-line values |

## Blocked checks — run on a Docker host

```bash
./scripts/setup.sh && ./scripts/validate_environment.sh
```
EOF
