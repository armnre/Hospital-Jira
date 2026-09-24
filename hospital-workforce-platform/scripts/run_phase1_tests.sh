#!/usr/bin/env bash
# HWDT-18: run the Phase 1 test suites (backend unit + integration against PostgreSQL, frontend components)
# and render docs/phase1-test-report.md.
# Usage (from the repository that has node_modules, e.g. the sandbox root or a dev container):
#   hospital-workforce-platform/scripts/run_phase1_tests.sh
set -uo pipefail
PLAT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${PLAT}/tests/results"
mkdir -p "$OUT"
npx vitest run --config "${PLAT}/tests/vitest.backend.config.ts" --reporter=verbose --reporter=json --outputFile.json="${OUT}/backend.json"; BE=$?
npx vitest run --config "${PLAT}/tests/vitest.frontend.config.ts" --reporter=verbose --reporter=json --outputFile.json="${OUT}/frontend.json"; FE=$?
python3 - "$OUT" "${PLAT}/docs/phase1-test-report.md" <<'PY'
import json, sys, datetime, os, platform, subprocess
out, target = sys.argv[1], sys.argv[2]
lines = ["# Phase 1 Test Report", ""]
node = subprocess.run(["node", "-v"], capture_output=True, text=True).stdout.strip()
lines.append(f"Generated {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} · node {node} · {platform.system()} · PostgreSQL integration database created and dropped per run")
lines.append("")
total = {"passed": 0, "failed": 0}
sections = []
for suite in ("backend", "frontend"):
    path = os.path.join(out, f"{suite}.json")
    if not os.path.exists(path):
        sections.append(f"## {suite.title()}\n\nNo results (suite did not run).\n"); continue
    data = json.load(open(path))
    rows = []
    for f in data["testResults"]:
        fname = os.path.relpath(f["name"], os.path.dirname(os.path.dirname(target)))
        for a in f["assertionResults"]:
            st = "PASS" if a["status"] == "passed" else "FAIL" if a["status"] == "failed" else a["status"].upper()
            total["passed" if st == "PASS" else "failed"] += 1
            group = " › ".join(a.get("ancestorTitles", []))
            rows.append(f"| {st} | `{fname.split('/')[-1]}` | {group} | {a['title'].replace('|','/')} | {int(a.get('duration') or 0)} ms |")
    sections.append(f"## {suite.title()} ({data['numPassedTests']}/{data['numTotalTests']} passed)\n\n| Result | File | Group | Test | Time |\n|---|---|---|---|---|\n" + "\n".join(rows) + "\n")
lines.append(f"**Summary: {total['passed']} passed, {total['failed']} failed**")
lines.append("")
lines.append("| Requirement | Covered by |")
lines.append("|---|---|")
for req, cov in [
    ("Employee creation", "api.integration › employee CRUD › creates an employee; rejects duplicates / invalid input"),
    ("Employee update", "api.integration › employee CRUD › updates an employee (partial PUT)"),
    ("Credential creation", "api.integration › credential management › creates a credential as PENDING_VERIFICATION"),
    ("Expiry calculation", "credential-rules › Rule 1 (8 boundary cases, leap year); api › 30/60-day buckets; SQL == TS boundary test"),
    ("Expired credential detection", "credential-rules › Rule 2; api › detects expired credentials and never marks them valid"),
    ("Employee list rendering", "components › Employee list (render, filters, debounced search)"),
    ("Profile page", "components › Employee profile page"),
    ("Credential status display", "components › Credential status display (4 statuses, expired row, days remaining)"),
    ("Security (hashing, JWT expiry, RBAC, validation)", "security.test.ts; api › authentication / RBAC"),
]:
    lines.append(f"| {req} | {cov} |")
lines.append("")
lines += sections
open(target, "w").write("\n".join(lines) + "\n")
print(f"report -> {target}: {total}")
PY
exit $(( BE || FE ))
